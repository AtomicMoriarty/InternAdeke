// Reuniões comerciais: o que foi conversado, o que ficou decidido, o que virou
// tarefa.
//
// Herda a essência das antigas atas comerciais, que viviam escondidas dentro de
// um produto: colar o texto da reunião e extrair dele os encaminhamentos, com
// os @ virando responsáveis. O que muda é o lugar e o alcance — agora é uma
// seção do Comercial, serve para reunião interna e com cliente, e a reunião
// tem campos próprios em vez de ser um bloco de texto solto.
//
// A tarefa gerada é um card de verdade, não um item de lista: é assim que ela
// aparece no Eu de quem ficou responsável, no Quadro Geral e nos relatórios.

import type { DashboardState, Area, Cliente, Plano, Item } from "@/lib/dashboardTypes";
import type { Profile } from "@/lib/profiles";
import { AREA_COMERCIAL, CAMPO_ORIGEM_REUNIAO } from "@/lib/comercial";

export const TIPOS_REUNIAO = [
  { id: "cliente", nome: "Com cliente", cor: "#0DD3C5" },
  { id: "interna", nome: "Interna", cor: "#8B5CF6" },
] as const;

export type TipoReuniao = "cliente" | "interna";

export type Reuniao = {
  id: string;
  titulo: string;
  /** DD/MM/AAAA, como o resto do sistema. */
  data: string;
  tipo: TipoReuniao;
  /** Empresa do Comercial, quando a reunião é com cliente. */
  clienteId?: string;
  /** Quem do escritório participou. */
  participantes: string[];
  /** Quem de fora participou, escrito à mão. */
  externos?: string;
  /** O que foi conversado. */
  pauta?: string;
  /** O que ficou decidido. */
  decisoes?: string;
  /** O que alguém ficou de fazer. É daqui que saem as tarefas. */
  encaminhamentos?: string;
  /** A transcrição crua, quando houver. Fica guardada como registro. */
  transcricao?: string;
  /** Ids dos cards já gerados, para não duplicar ao gerar de novo. */
  tarefasGeradas?: string[];
  criadoEm?: string;
  autorId?: string | null;
  autorNome?: string;
};

/** Onde as tarefas de reunião moram, separadas dos negócios do funil. */
export const PLANO_TAREFAS = "Tarefas de reunião";

/** Empresa sintética que guarda as tarefas de reunião interna. */
export const CLIENTE_INTERNO = "__reunioes_internas";
export const NOME_CLIENTE_INTERNO = "Reuniões internas";

function idCurto(prefixo: string) {
  return `${prefixo}${Math.random().toString(36).slice(2, 9)}`;
}

function dataBR(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function reuniaoVazia(autor?: Profile | null, agora: Date = new Date()): Reuniao {
  return {
    id: idCurto("re"),
    titulo: "",
    data: dataBR(agora),
    tipo: "cliente",
    clienteId: "",
    participantes: autor?.id ? [autor.id] : [],
    externos: "",
    pauta: "",
    decisoes: "",
    encaminhamentos: "",
    transcricao: "",
    tarefasGeradas: [],
    criadoEm: agora.toISOString(),
    autorId: autor?.id ?? null,
    autorNome: autor?.display_name || "",
  };
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

export function reunioesDoComercial(data: DashboardState | null): Reuniao[] {
  const area = (data?.areas || []).find((a: Area) => a.id === AREA_COMERCIAL);
  const lista = area?.reunioes;
  if (!Array.isArray(lista)) return [];
  // Mais recente primeiro: é a que alguém quer reler.
  return [...(lista as Reuniao[])].sort((a, b) =>
    String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")),
  );
}

/** Grava a lista de reuniões de volta na área comercial. */
function comReunioes(data: DashboardState, lista: Reuniao[]): DashboardState {
  return {
    ...data,
    areas: (data.areas || []).map((a: Area) =>
      a.id !== AREA_COMERCIAL ? a : { ...a, reunioes: lista },
    ),
  };
}

export function salvarReuniao(data: DashboardState, reuniao: Reuniao): DashboardState {
  const atuais = reunioesDoComercial(data);
  const existe = atuais.some((r) => r.id === reuniao.id);
  return comReunioes(
    data,
    existe ? atuais.map((r) => (r.id === reuniao.id ? reuniao : r)) : [reuniao, ...atuais],
  );
}

export function removerReuniao(data: DashboardState, reuniaoId: string): DashboardState {
  return comReunioes(
    data,
    reunioesDoComercial(data).filter((r) => r.id !== reuniaoId),
  );
}

// ─── Extração de tarefas ─────────────────────────────────────────────────────

function semAcento(s: string) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Palavras que denunciam um encaminhamento no meio de um texto corrido. */
const VERBOS_DE_ACAO = [
  "acao",
  "task",
  "tarefa",
  "encaminhamento",
  "responsavel",
  "prazo",
  "ficou de",
  "ficou definido",
  "deve",
  "precisa",
  "vamos",
  "enviar",
  "criar",
  "validar",
  "revisar",
  "agendar",
  "retornar",
  "preparar",
  "apresentar",
  "cobrar",
  "alinhar",
  "confirmar",
  "levantar",
  "montar",
];

export type TarefaExtraida = {
  nome: string;
  responsaveis: string[];
  /** A linha como foi escrita, para o card guardar a origem exata. */
  original: string;
};

function mencionados(linha: string, profiles: Profile[]): string[] {
  const usuarios = [...String(linha).matchAll(/@([a-zA-Z0-9._-]+)/g)].map((m) => semAcento(m[1]));
  if (!usuarios.length) return [];
  return profiles.filter((p) => usuarios.includes(semAcento(p.username || ""))).map((p) => p.id);
}

function limparNome(linha: string) {
  return linha
    .replace(/^[\s\-•*–—]+/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^(acao|task|tarefa|encaminhamento)\s*[:-]\s*/i, "")
    .replace(/@([a-zA-Z0-9._-]+)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tira as tarefas de um texto de reunião.
 *
 * Duas passadas, nesta ordem: se houver um cabeçalho de encaminhamentos, só o
 * que vem embaixo dele conta — é o mais confiável, porque a pessoa já separou.
 * Sem cabeçalho, procura linhas com verbo de ação, que é palpite e por isso
 * fica em segundo lugar.
 */
export function tarefasDoTexto(texto: string, profiles: Profile[] = []): TarefaExtraida[] {
  const linhas = String(texto || "")
    .replace(/\r/g, "\n")
    .split("\n");

  const inicio = linhas.findIndex((l) =>
    /^(to[\s-]?do|tarefas?|tasks?|encaminhamentos?|proximos passos|acoes)\s*:?\s*$/i.test(
      semAcento(l),
    ),
  );

  const candidatas =
    inicio >= 0
      ? linhas.slice(inicio + 1).filter((l) => l.trim())
      : linhas.filter((l) => {
          const n = semAcento(l);
          return n && VERBOS_DE_ACAO.some((v) => n.includes(v));
        });

  const vistas = new Set<string>();
  const out: TarefaExtraida[] = [];
  for (const linha of candidatas) {
    const nome = limparNome(linha);
    // Linha curta demais costuma ser cabeçalho ou sobra de formatação.
    if (nome.length < 6) continue;
    const chave = semAcento(nome);
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    out.push({
      nome: nome.slice(0, 180),
      responsaveis: mencionados(linha, profiles),
      original: linha.trim(),
    });
    if (out.length >= 30) break;
  }
  return out;
}

// ─── Virar tarefa ────────────────────────────────────────────────────────────

// A constante mora em comercial.ts porque o funil precisa dela para filtrar.
export const CAMPO_ORIGEM = CAMPO_ORIGEM_REUNIAO;

function montarCard(t: TarefaExtraida, reuniao: Reuniao, agora: Date): Item {
  const iso = agora.toISOString();
  return {
    id: idCurto("it"),
    name: t.nome,
    tipo: "Outro",
    responsavel: "",
    responsaveis: t.responsaveis,
    status: "Não iniciado",
    kanbanStatus: "A Fazer",
    obs: "",
    descricao: `${t.original}\n\n— encaminhamento da reunião "${reuniao.titulo}" (${reuniao.data})`,
    prazo: "",
    dataInicio: dataBR(agora),
    criadoEm: iso,
    statusChangedAt: iso,
    checklist: [],
    etiquetas: [],
    // Marca que separa tarefa de reunião dos negócios do funil.
    [CAMPO_ORIGEM]: reuniao.id,
  };
}

/** Este card nasceu de uma reunião? O funil usa isto para não mostrá-lo. */
export function ehTarefaDeReuniao(item: Item): boolean {
  return Boolean(item?.[CAMPO_ORIGEM]);
}

export type PlanoDeGeracao = {
  /** Os cards prontos, com id definitivo. */
  cards: Item[];
  /** Quantas foram ignoradas por já existirem desta mesma reunião. */
  repetidas: number;
  /** Em qual empresa eles vão entrar. */
  alvoId: string;
};

/**
 * Decide o que criar, sem tocar no estado.
 *
 * Separado da aplicação porque quem chama precisa saber o que foi criado — para
 * avisar os responsáveis — e o updater do React roda depois, fora de hora. Com
 * o plano em mãos, a tela avisa com os ids certos e aplica em seguida.
 *
 * Gerar duas vezes não duplica: compara pelo nome com o que já saiu desta
 * reunião. Reunião com cliente joga na empresa; reunião interna joga numa
 * empresa própria, criada sob demanda, para a tarefa não ficar sem casa.
 */
export function planejarTarefas(
  data: DashboardState,
  reuniao: Reuniao,
  profiles: Profile[] = [],
  agora: Date = new Date(),
): PlanoDeGeracao {
  const alvoId =
    reuniao.tipo === "interna" || !reuniao.clienteId ? CLIENTE_INTERNO : reuniao.clienteId;
  const extraidas = tarefasDoTexto(reuniao.encaminhamentos || "", profiles);
  if (!extraidas.length) return { cards: [], repetidas: 0, alvoId };

  const jaExistem = new Set<string>();
  for (const c of clientesDoComercial(data)) {
    for (const pl of (c.planos || []) as Plano[]) {
      for (const it of (pl.items || []) as Item[]) {
        if (it[CAMPO_ORIGEM] === reuniao.id) jaExistem.add(semAcento(String(it.name || "")));
      }
    }
  }

  const novas = extraidas.filter((t) => !jaExistem.has(semAcento(t.nome)));
  return {
    cards: novas.map((t) => montarCard(t, reuniao, agora)),
    repetidas: extraidas.length - novas.length,
    alvoId,
  };
}

/** Grava os cards planejados e anota os ids na reunião. */
export function aplicarTarefas(
  data: DashboardState,
  reuniao: Reuniao,
  plano: PlanoDeGeracao,
): DashboardState {
  if (!plano.cards.length) return data;
  let proximo = garantirCliente(data, plano.alvoId);
  proximo = inserirCards(proximo, plano.alvoId, plano.cards);
  return salvarReuniao(proximo, {
    ...reuniao,
    tarefasGeradas: [...(reuniao.tarefasGeradas || []), ...plano.cards.map((c) => c.id)],
  });
}

function clientesDoComercial(data: DashboardState): Cliente[] {
  const area = (data.areas || []).find((a: Area) => a.id === AREA_COMERCIAL);
  return ((area?.clientes || []) as Cliente[]) || [];
}

/** A empresa das reuniões internas só nasce quando alguém precisa dela. */
function garantirCliente(data: DashboardState, clienteId: string): DashboardState {
  if (clienteId !== CLIENTE_INTERNO) return data;
  if (clientesDoComercial(data).some((c) => c.id === CLIENTE_INTERNO)) return data;
  return {
    ...data,
    areas: (data.areas || []).map((a: Area) =>
      a.id !== AREA_COMERCIAL
        ? a
        : {
            ...a,
            clientes: [
              ...((a.clientes || []) as Cliente[]),
              {
                id: CLIENTE_INTERNO,
                name: NOME_CLIENTE_INTERNO,
                responsaveis: [],
                descricao: "Guarda as tarefas que saem das reuniões internas do time.",
                tags: [],
                planos: [],
              },
            ],
          },
    ),
  };
}

function inserirCards(data: DashboardState, clienteId: string, cards: Item[]): DashboardState {
  return {
    ...data,
    areas: (data.areas || []).map((a: Area) => {
      if (a.id !== AREA_COMERCIAL) return a;
      return {
        ...a,
        clientes: ((a.clientes || []) as Cliente[]).map((c) => {
          if (c.id !== clienteId) return c;
          const planos = (c.planos || []) as Plano[];
          const alvo = planos.find((pl) => pl.name === PLANO_TAREFAS);
          if (!alvo) {
            return {
              ...c,
              planos: [
                ...planos,
                { id: idCurto("pl"), name: PLANO_TAREFAS, notas: [], items: cards },
              ],
            };
          }
          return {
            ...c,
            planos: planos.map((pl) =>
              pl.id !== alvo.id ? pl : { ...pl, items: [...(pl.items || []), ...cards] },
            ),
          };
        }),
      };
    }),
  };
}

/** Os cards que saíram de uma reunião, para mostrar embaixo dela. */
export function tarefasDaReuniao(data: DashboardState, reuniaoId: string) {
  const out: { item: Item; clienteNome: string; clienteId: string; planoId: string }[] = [];
  for (const c of clientesDoComercial(data)) {
    for (const pl of (c.planos || []) as Plano[]) {
      for (const it of (pl.items || []) as Item[]) {
        if (it[CAMPO_ORIGEM] === reuniaoId) {
          out.push({ item: it, clienteNome: c.name || "", clienteId: c.id, planoId: pl.id });
        }
      }
    }
  }
  return out;
}

/** Um resumo curto da reunião, para a lista. */
export function resumirReuniao(r: Reuniao): string {
  const partes = [r.pauta, r.decisoes, r.encaminhamentos].filter(Boolean).join(" ");
  const limpo = partes.replace(/\s+/g, " ").trim();
  return limpo.length > 160 ? `${limpo.slice(0, 160)}…` : limpo;
}
