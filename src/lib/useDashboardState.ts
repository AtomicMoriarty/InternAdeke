// Leitura e escrita do dashboard_state, com uma cópia só para o app inteiro.
//
// O estado é um JSON único de quase meio mega. Existe uma cópia só, num módulo:
// quem chama o hook se inscreve nela, o primeiro pede ao servidor e os outros
// recebem o que já está em memória. Um canal de tempo real para todos.
//
// Gravar não reenvia mais o estado inteiro. Cada edição vira operações
// (sincronizacao.ts) que o banco aplica em cima da versão dele, com a linha
// travada. O que a tela mostra é sempre:
//
//   versão do servidor  +  lotes enviados que ele ainda não devolveu  +  pendentes
//
// Quando chega uma versão nova pelo tempo real, de outra pessoa ou o eco da
// nossa, a conta é refeita em cima dela. Antes, o que chegava enquanto havia
// gravação nossa em voo era descartado, e a gravação seguinte apagava a edição
// da outra pessoa sem ninguém ver. Pelo mesmo motivo o painel principal não
// tem mais um gravador próprio: eram dois escrevendo a mesma linha, e um
// atropelava o outro mesmo com uma pessoa só usando.
//
// Como saber se a versão que chegou já inclui um lote nosso: cada lote leva uma
// marca, e o banco guarda as últimas marcas aplicadas na coluna `marcas`.
//
// O servidor guarda o estado em area_state, uma linha por área
// (estadoPorArea.ts), e só entrega a cada pessoa as áreas que ela pode ver.
// Aqui as linhas são montadas de volta no DashboardState de sempre, e o tempo
// real traz só a linha que mudou. Um lote que mexe em duas áreas só está
// confirmado quando as duas linhas voltaram com a marca dele.
//
// Antes da migração chegar ao banco, o modo "legado" lê e acompanha o
// dashboard_state como antes.
//
// Os valores em R$ dos negócios não passam pelo JSON: vão para a tabela
// valores_negocio, que o banco só entrega a quem pode ver (valoresNegocio.ts).

import { useCallback, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DashboardState } from "@/lib/dashboardTypes";
import { aplicar, diferenca, iguais, type Operacao } from "@/lib/sincronizacao";
import { DASHBOARD_ROW_ID, faltaNoBanco, gravarOperacoes, novaMarca } from "@/lib/gravarDashboard";
import { linhasDoLote, montarEstado, type LinhaArea } from "@/lib/estadoPorArea";
import { separarValores, sobreporValores, type MudancaValor } from "@/lib/valoresNegocio";

type Ouvinte = () => void;
type Lote = { marca: string; ops: Operacao[]; linhas: Set<string> };
type LinhaDashboard = { data?: unknown; marcas?: unknown; updated_at?: string | null };

/** Espera para juntar o que é digitado em sequência num lote só. */
const ESPERA_GRAVACAO_MS = 500;
/** Sem eco do tempo real depois disto, busca de novo para confirmar o lote. */
const ESPERA_ECO_MS = 8000;

const loja = {
  /** "areas" lê area_state; "legado", o dashboard_state de antes da migração. */
  modo: null as "areas" | "legado" | null,
  /** Última versão que veio do banco, já montada. */
  servidor: null as DashboardState | null,
  // Modo legado: a linha única.
  marcasServidor: new Set<string>(),
  carimboServidor: 0,
  // Modo áreas: uma entrada por linha recebida.
  linhas: new Map<string, LinhaArea>(),
  marcasPorLinha: new Map<string, Set<string>>(),
  carimbosPorLinha: new Map<string, number>(),
  canalAreas: null as ReturnType<typeof supabase.channel> | null,
  /** O que a tela mostra. */
  data: null as DashboardState | null,
  carregado: false,
  /** Enviados e aceitos, mas o servidor que temos ainda não os inclui. */
  emVoo: [] as Lote[],
  /** Editados aqui e ainda não enviados. */
  pendentes: [] as Operacao[],
  enviando: false,
  falhasSeguidas: 0,
  ouvintes: new Set<Ouvinte>(),
  canal: null as ReturnType<typeof supabase.channel> | null,
  carregando: null as Promise<void> | null,
  timerGravacao: null as ReturnType<typeof setTimeout> | null,
  /**
   * A tabela valores_negocio existe? Até a migração chegar ao banco, o valor
   * continua no JSON, como antes.
   */
  valoresNaTabela: false,
  valores: new Map<string, number>(),
  canalValores: null as ReturnType<typeof supabase.channel> | null,
  filaValores: Promise.resolve() as Promise<void>,
};

function avisar() {
  for (const o of loja.ouvintes) o();
}

/** O servidor que temos já inclui este lote? */
function loteConfirmado(lote: Lote) {
  if (loja.modo !== "areas") return loja.marcasServidor.has(lote.marca);
  for (const id of lote.linhas) {
    if (!loja.marcasPorLinha.get(id)?.has(lote.marca)) return false;
  }
  return true;
}

/** Refaz a tela: servidor + lotes que ele ainda não tem + pendentes. */
function recalcular() {
  loja.emVoo = loja.emVoo.filter((l) => !loteConfirmado(l));
  if (!loja.servidor) return;
  let vista = loja.servidor;
  for (const lote of loja.emVoo) vista = aplicar(vista, lote.ops);
  vista = aplicar(vista, loja.pendentes);
  if (loja.valoresNaTabela) vista = sobreporValores(vista, loja.valores);
  // O eco da nossa própria gravação dá o mesmo que já está na tela; publicar
  // de novo faria o app inteiro redesenhar por nada.
  if (loja.data && iguais(vista, loja.data)) return;
  loja.data = vista;
  avisar();
}

function receberDoServidor(linha: LinhaDashboard, permitirIgual = true) {
  if (!linha.data) return;
  const carimbo = linha.updated_at ? Date.parse(linha.updated_at) : 0;
  // O tempo real pode entregar fora de ordem; versão mais velha não volta.
  if (
    carimbo &&
    (carimbo < loja.carimboServidor || (!permitirIgual && carimbo === loja.carimboServidor))
  ) {
    return;
  }
  loja.servidor = linha.data as DashboardState;
  loja.marcasServidor = new Set(Array.isArray(linha.marcas) ? (linha.marcas as string[]) : []);
  if (carimbo) loja.carimboServidor = carimbo;
  const primeiraVez = !loja.carregado;
  loja.carregado = true;
  recalcular();
  if (primeiraVez) avisar();
}

/**
 * Recebe linhas de area_state, da carga ou do tempo real.
 *
 * Cada linha tem o seu carimbo: o tempo real pode entregar fora de ordem, e
 * uma versão mais velha de uma área não volta por cima da nova.
 */
function receberLinhas(linhas: LinhaArea[], permitirIgual = true) {
  let mudou = false;
  for (const linha of linhas) {
    if (!linha?.id) continue;
    const carimbo = linha.updated_at ? Date.parse(linha.updated_at) : 0;
    const anterior = loja.carimbosPorLinha.get(linha.id) ?? 0;
    if (carimbo && (carimbo < anterior || (!permitirIgual && carimbo === anterior))) continue;
    loja.linhas.set(linha.id, linha);
    loja.marcasPorLinha.set(
      linha.id,
      new Set(Array.isArray(linha.marcas) ? (linha.marcas as string[]) : []),
    );
    if (carimbo) loja.carimbosPorLinha.set(linha.id, carimbo);
    mudou = true;
  }
  if (!mudou && loja.carregado) return;
  loja.servidor = montarEstado([...loja.linhas.values()]);
  const primeiraVez = !loja.carregado;
  loja.carregado = true;
  recalcular();
  if (primeiraVez) avisar();
}

async function carregar() {
  if (loja.carregando) return loja.carregando;
  loja.carregando = (async () => {
    // Os valores vêm junto, antes de a tela aparecer: editar um valor antes
    // de saber se a tabela existe o mandaria para o lugar errado.
    const [porArea] = await Promise.all([
      supabase.from("area_state").select("*"),
      carregarValores(),
    ]);

    if (!porArea.error && porArea.data?.length) {
      loja.modo = "areas";
      assinarAreas();
      // Área que deixou de vir (a pessoa perdeu o acesso) sai da tela.
      const vieram = new Set(porArea.data.map((l) => l.id));
      for (const id of [...loja.linhas.keys()]) {
        if (!vieram.has(id)) {
          loja.linhas.delete(id);
          loja.marcasPorLinha.delete(id);
        }
      }
      receberLinhas(porArea.data as LinhaArea[]);
      return;
    }
    if (porArea.error && !faltaNoBanco(porArea.error)) {
      console.error("[dashboard] area_state não carregou:", porArea.error.message);
    }

    // Banco sem a migração (ou sem nada ainda): o dashboard_state de antes.
    // "*" e não a lista de colunas: a coluna marcas só existe depois da
    // migração das operações, e o app precisa funcionar antes dela.
    loja.modo = "legado";
    assinarRealtime();
    const { data: linha } = await supabase
      .from("dashboard_state")
      .select("*")
      .eq("id", DASHBOARD_ROW_ID)
      .maybeSingle();
    if (linha?.data) receberDoServidor(linha as LinhaDashboard);
    else if (!loja.carregado) {
      loja.carregado = true;
      avisar();
    }
  })().finally(() => {
    loja.carregando = null;
  });
  return loja.carregando;
}

/**
 * Tempo real por área. O banco só entrega a linha a quem pode vê-la, então
 * cada um recebe só as áreas que lhe cabem, e só a que mudou.
 *
 * Ao conectar (e ao reconectar, depois de a rede cair) busca tudo de novo:
 * o que mudou enquanto o canal estava fora não chega pelo canal.
 */
function assinarAreas() {
  if (loja.canalAreas) return;
  loja.canalAreas = supabase
    .channel("area_state")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "area_state" },
      (payload: { new?: Partial<LinhaArea> }) => {
        if (payload.new?.id) receberLinhas([payload.new as LinhaArea], false);
      },
    )
    .subscribe((status: string) => {
      // Também na primeira vez: a carga veio antes de o canal estar de pé, e
      // o que alguém gravou nesse meio-tempo não viria por ele.
      if (status === "SUBSCRIBED") void recarregarDashboardState();
    });
  if (typeof window !== "undefined") {
    // Fechar a aba no meio da espera de meio segundo perderia a última edição.
    window.addEventListener("pagehide", () => void enviar());
  }
}

async function carregarValores() {
  const { data, error } = await supabase.from("valores_negocio").select("item_id, valor");
  if (error) {
    loja.valoresNaTabela = false;
    if (!faltaNoBanco(error)) console.error("[valores] não carregou:", error.message);
    return;
  }
  loja.valoresNaTabela = true;
  loja.valores = new Map((data || []).map((l) => [l.item_id, Number(l.valor)]));
  assinarValores();
}

/**
 * Tempo real dos valores, num canal à parte e só depois de saber que a tabela
 * existe: assinar tabela inexistente derruba o canal, e junto iria o do estado.
 */
function assinarValores() {
  if (loja.canalValores) return;
  loja.canalValores = supabase
    .channel("valores_negocio")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "valores_negocio" },
      (payload: {
        eventType: string;
        new?: { item_id?: string; valor?: number };
        old?: { item_id?: string };
      }) => {
        if (!loja.valoresNaTabela) return;
        if (payload.eventType === "DELETE") {
          if (payload.old?.item_id) loja.valores.delete(payload.old.item_id);
        } else if (payload.new?.item_id) {
          loja.valores.set(payload.new.item_id, Number(payload.new.valor));
        }
        recalcular();
      },
    )
    .subscribe();
}

/**
 * Grava valores de negócio na tabela. Quem não pode ver valores também não
 * pode gravar — o banco recusa —, então a tela volta ao que estava.
 */
async function gravarValores(mudancas: MudancaValor[]) {
  const antes = new Map(loja.valores);
  const gravar: { item_id: string; valor: number }[] = [];
  const apagar: string[] = [];
  for (const m of mudancas) {
    if (m.valor === null || (m.valor === 0 && !loja.valores.has(m.itemId))) {
      if (loja.valores.has(m.itemId)) apagar.push(m.itemId);
      loja.valores.delete(m.itemId);
    } else {
      gravar.push({ item_id: m.itemId, valor: m.valor });
      loja.valores.set(m.itemId, m.valor);
    }
  }
  if (!gravar.length && !apagar.length) return;
  const erros = (
    await Promise.all([
      gravar.length ? supabase.from("valores_negocio").upsert(gravar) : null,
      apagar.length ? supabase.from("valores_negocio").delete().in("item_id", apagar) : null,
    ])
  )
    .map((r) => r?.error)
    .filter(Boolean);
  if (erros.length) {
    console.error("[valores] gravação recusada:", erros[0]?.message);
    loja.valores = antes;
    recalcular();
  }
}

function assinarRealtime() {
  if (loja.canal) return;
  loja.canal = supabase
    .channel("dashboard_state_compartilhado")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "dashboard_state",
        filter: `id=eq.${DASHBOARD_ROW_ID}`,
      },
      (payload: { new?: LinhaDashboard }) => {
        if (payload.new) receberDoServidor(payload.new, false);
      },
    )
    .subscribe();
  if (typeof window !== "undefined") {
    // Fechar a aba no meio da espera de meio segundo perderia a última edição.
    window.addEventListener("pagehide", () => void enviar());
  }
}

function inscrever(o: Ouvinte) {
  loja.ouvintes.add(o);
  if (!loja.carregado) void carregar();
  return () => {
    loja.ouvintes.delete(o);
    // O canal fica de pé enquanto a aba viver: derrubar e reabrir a cada troca
    // de tela custaria mais do que mantê-lo.
  };
}

function agendarGravacao(ms = ESPERA_GRAVACAO_MS) {
  if (loja.timerGravacao) clearTimeout(loja.timerGravacao);
  loja.timerGravacao = setTimeout(() => {
    loja.timerGravacao = null;
    void enviar();
  }, ms);
}

/** Manda os pendentes como um lote. Um lote por vez, para o banco ver na ordem. */
async function enviar() {
  if (loja.enviando || !loja.pendentes.length) return;
  const lote: Lote = {
    marca: novaMarca(),
    ops: loja.pendentes,
    linhas: linhasDoLote(loja.pendentes),
  };
  loja.pendentes = [];
  loja.emVoo.push(lote);
  loja.enviando = true;

  let enviadoInteiro: DashboardState | null = null;
  const r = await gravarOperacoes(supabase, lote.ops, lote.marca, () => {
    enviadoInteiro = loja.data;
    return enviadoInteiro;
  });
  loja.enviando = false;

  if (!r.ok) {
    // Volta para a fila e tenta de novo, esperando mais a cada falha seguida.
    // A tela continua mostrando a edição: ela não se perde por cair a rede.
    console.error("[dashboard] gravação falhou, tentando de novo:", r.erro);
    loja.emVoo = loja.emVoo.filter((l) => l !== lote);
    loja.pendentes = [...lote.ops, ...loja.pendentes];
    loja.falhasSeguidas++;
    agendarGravacao(Math.min(30_000, 1000 * 2 ** loja.falhasSeguidas));
    return;
  }
  loja.falhasSeguidas = 0;

  if (r.jeito === "inteiro") {
    // Banco ainda sem a função: gravou o JSON inteiro, que passa a ser a
    // versão do servidor.
    loja.emVoo = loja.emVoo.filter((l) => l !== lote);
    if (enviadoInteiro) loja.servidor = enviadoInteiro;
  } else {
    setTimeout(() => {
      if (loja.emVoo.includes(lote)) void recarregarDashboardState();
    }, ESPERA_ECO_MS);
  }

  if (loja.pendentes.length) agendarGravacao();
}

const lerData = () => loja.data;

/** O estado como a tela vê, para quem lê fora de um componente. */
export const lerDashboardState = lerData;
const lerCarregado = () => loja.carregado;
const noServidor = () => null;
const carregadoNoServidor = () => false;

/**
 * Muda o estado: a tela atualiza na hora, e a gravação sai em lote logo depois.
 * É o mesmo update do hook, para quem está fora de um componente.
 */
export function atualizarDashboardState(updater: (prev: DashboardState) => DashboardState) {
  if (!loja.data) return;
  const novo = updater(loja.data);
  if (novo === loja.data) return;
  let ops = diferenca(loja.data, novo);
  loja.data = novo;
  avisar();
  if (loja.valoresNaTabela) {
    const separado = separarValores(ops);
    ops = separado.ops;
    // Em fila: duas mudanças do mesmo valor não podem chegar ao banco trocadas.
    if (separado.valores.length) {
      const mudancas = separado.valores;
      loja.filaValores = loja.filaValores.then(() => gravarValores(mudancas));
    }
  }
  if (!ops.length) return;
  loja.pendentes.push(...ops);
  agendarGravacao();
}

export function useDashboardState(_escopo = "default") {
  const data = useSyncExternalStore(inscrever, lerData, noServidor);
  const loaded = useSyncExternalStore(inscrever, lerCarregado, carregadoNoServidor);

  const update = useCallback(atualizarDashboardState, []);

  return { data, loaded, update };
}

/**
 * Cria o estado no banco quando ele ainda não existe — o primeiro uso.
 *
 * Se outra aba criou no mesmo instante, a inserção falha pela chave e a
 * versão dela é carregada.
 */
export async function criarDashboardStateSeVazio(inicial: DashboardState) {
  if (!loja.carregado || loja.servidor) return;
  if (loja.modo === "areas") {
    // O estado inteiro como uma operação: o banco divide em linhas.
    const r = await gravarOperacoes(
      supabase,
      [{ op: "set", caminho: [], valor: inicial }],
      novaMarca(),
      () => inicial,
    );
    if (!r.ok) console.error("[dashboard] não criou o estado inicial:", r.erro);
    await recarregarDashboardState();
    return;
  }
  const { error } = await supabase
    .from("dashboard_state")
    .insert({ id: DASHBOARD_ROW_ID, data: inicial as never });
  if (error) {
    await recarregarDashboardState();
    return;
  }
  receberDoServidor({ data: inicial });
}

/**
 * Busca de novo do servidor e refaz a tela em cima do que chegar.
 *
 * Serve para quando alguém sabe que o estado mudou por fora — uma importação
 * grande, ou uma correção feita direto no banco. Edições ainda não gravadas
 * não se perdem: são reaplicadas em cima.
 */
export function recarregarDashboardState() {
  loja.carimboServidor = 0;
  loja.carimbosPorLinha.clear();
  return carregar();
}
