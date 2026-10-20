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

import { useCallback, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DashboardState } from "@/lib/dashboardTypes";
import { aplicar, diferenca, iguais, type Operacao } from "@/lib/sincronizacao";
import { DASHBOARD_ROW_ID, gravarOperacoes, novaMarca } from "@/lib/gravarDashboard";

type Ouvinte = () => void;
type Lote = { marca: string; ops: Operacao[] };
type LinhaDashboard = { data?: unknown; marcas?: unknown; updated_at?: string | null };

/** Espera para juntar o que é digitado em sequência num lote só. */
const ESPERA_GRAVACAO_MS = 500;
/** Sem eco do tempo real depois disto, busca de novo para confirmar o lote. */
const ESPERA_ECO_MS = 8000;

const loja = {
  /** Última versão que veio do banco. */
  servidor: null as DashboardState | null,
  marcasServidor: new Set<string>(),
  carimboServidor: 0,
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
};

function avisar() {
  for (const o of loja.ouvintes) o();
}

/** Refaz a tela: servidor + lotes que ele ainda não tem + pendentes. */
function recalcular() {
  loja.emVoo = loja.emVoo.filter((l) => !loja.marcasServidor.has(l.marca));
  if (!loja.servidor) return;
  let vista = loja.servidor;
  for (const lote of loja.emVoo) vista = aplicar(vista, lote.ops);
  vista = aplicar(vista, loja.pendentes);
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

async function carregar() {
  if (loja.carregando) return loja.carregando;
  loja.carregando = (async () => {
    // "*" e não a lista de colunas: a coluna marcas só existe depois da
    // migração, e o app precisa funcionar antes dela.
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
  assinarRealtime();
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
  const lote: Lote = { marca: novaMarca(), ops: loja.pendentes };
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
const lerCarregado = () => loja.carregado;
const noServidor = () => null;
const carregadoNoServidor = () => false;

export function useDashboardState(_escopo = "default") {
  const data = useSyncExternalStore(inscrever, lerData, noServidor);
  const loaded = useSyncExternalStore(inscrever, lerCarregado, carregadoNoServidor);

  const update = useCallback((updater: (prev: DashboardState) => DashboardState) => {
    if (!loja.data) return;
    const novo = updater(loja.data);
    if (novo === loja.data) return;
    const ops = diferenca(loja.data, novo);
    loja.data = novo;
    avisar();
    if (!ops.length) return;
    loja.pendentes.push(...ops);
    agendarGravacao();
  }, []);

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
  return carregar();
}
