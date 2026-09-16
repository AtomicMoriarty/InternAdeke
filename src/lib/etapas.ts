// As colunas de cada quadro.
//
// Por muito tempo o sistema teve sete colunas e só: A Fazer, Em Andamento,
// Pendência Interna, Pendência Cliente, Monitoramento, Finalizado, Suspenso.
// Elas descrevem bem quase todo trabalho do escritório, porque quase todo
// trabalho do escritório é uma tarefa que alguém toca até acabar.
//
// O INPI não é assim. Um registro de marca atravessa um processo com etapas
// que o escritório não escolhe — exame formal, oposição, exame de mérito,
// nulidade, prazo recursal — e cada uma quer dizer uma coisa diferente sobre
// o que fazer e sobre quanto tempo falta. Jogar todas em "Em Andamento"
// apagaria justamente o que se precisa saber ao olhar o quadro.
//
// Então a área pode ter as suas etapas. O que não muda é que todo card
// continua tendo um estado nas sete colunas globais: é essa língua comum que
// deixa o Quadro Geral, a tela "Eu" e os relatórios falarem de INPI e de
// Societário na mesma frase. Cada etapa declara a que coluna global equivale.

import type { Item } from "@/lib/dashboardTypes";

// ─── As sete colunas de sempre ───────────────────────────────────────────────

export const KANBAN_COLUMNS = [
  "A Fazer",
  "Em Andamento",
  "Pendência Interna",
  "Pendência Cliente",
  "Monitoramento",
  "Finalizado",
  "Suspenso",
] as const;

export type KanbanStatus = (typeof KANBAN_COLUMNS)[number];

export const COLUMN_COLORS: Record<KanbanStatus, string> = {
  "A Fazer": "#64748B",
  "Em Andamento": "#3B82F6",
  "Pendência Interna": "#F59E0B",
  "Pendência Cliente": "#F97316",
  Monitoramento: "#06B6D4",
  Finalizado: "#10B981",
  Suspenso: "#94A3B8",
};

export type Etapa = {
  nome: string;
  /** A qual das sete colunas globais esta etapa corresponde. */
  equivale: KanbanStatus;
  cor: string;
  /** O que a etapa quer dizer, para quem nunca mexeu com INPI. */
  ajuda?: string;
};

/**
 * As etapas do registro de marca, na ordem em que o processo anda.
 *
 * A equivalência responde "de quem está esperando?". O que depende do INPI
 * é Monitoramento: não há o que fazer além de acompanhar. O que depende do
 * escritório é Pendência Interna, e prazo recursal é o caso mais claro —
 * o relógio está correndo contra nós.
 */
const INPI: Etapa[] = [
  {
    nome: "Inicial",
    equivale: "A Fazer",
    cor: "#64748B",
    ajuda: "Entrou e ainda não foi triado",
  },
  {
    nome: "Análise de viabilidade",
    equivale: "Em Andamento",
    cor: "#3B82F6",
    ajuda: "Busca de anterioridade e parecer sobre registrar ou não",
  },
  {
    nome: "Pendente de protocolo",
    equivale: "Pendência Interna",
    cor: "#F59E0B",
    ajuda: "Decidido registrar, falta protocolar no INPI",
  },
  {
    nome: "Exame formal",
    equivale: "Monitoramento",
    cor: "#06B6D4",
    ajuda: "Protocolado, o INPI confere a documentação",
  },
  {
    nome: "Oposição",
    equivale: "Monitoramento",
    cor: "#0EA5E9",
    ajuda: "Publicado, correndo o prazo para terceiros se oporem",
  },
  {
    nome: "Exame de mérito",
    equivale: "Monitoramento",
    cor: "#6366F1",
    ajuda: "O INPI analisa o pedido em si",
  },
  {
    nome: "Nulidade",
    equivale: "Monitoramento",
    cor: "#A855F7",
    ajuda: "Alguém pediu a nulidade do registro concedido",
  },
  {
    nome: "Prazo recursal",
    equivale: "Pendência Interna",
    cor: "#EF4444",
    ajuda: "O relógio corre contra nós: há recurso ou manifestação a apresentar",
  },
  {
    nome: "Deferida",
    equivale: "Monitoramento",
    cor: "#10B981",
    ajuda: "Concedida. Continua no radar pela vigência e pela renovação",
  },
  {
    nome: "Indeferida",
    equivale: "Finalizado",
    cor: "#78716C",
    ajuda: "Negada e sem recurso pendente",
  },
  {
    nome: "Suspensos",
    equivale: "Suspenso",
    cor: "#94A3B8",
    ajuda: "Parado por decisão do cliente ou do escritório",
  },
];

/** As sete colunas globais, no formato de etapa, para as áreas sem as suas. */
const GLOBAIS: Etapa[] = KANBAN_COLUMNS.map((c) => ({
  nome: c,
  equivale: c,
  cor: COLUMN_COLORS[c],
}));

const POR_AREA: Record<string, Etapa[]> = { inpi: INPI };

/** A área tem etapas próprias, ou usa as sete de sempre? */
export function temEtapasProprias(areaId: string): boolean {
  return Boolean(POR_AREA[areaId]);
}

export function etapasDaArea(areaId: string): Etapa[] {
  return POR_AREA[areaId] || GLOBAIS;
}

export function etapaPorNome(areaId: string, nome: string): Etapa | undefined {
  return etapasDaArea(areaId).find((e) => e.nome === nome);
}

/**
 * A coluna global de um estado qualquer.
 *
 * Um card do INPI guarda "Exame de mérito" em kanbanStatus. O Quadro Geral
 * geral, a tela "Eu" e os relatórios não conhecem essa etapa e não precisam
 * conhecer: para eles, isso é Monitoramento.
 */
export function equivalenteGlobal(areaId: string, estado?: string): KanbanStatus | null {
  if (!estado) return null;
  if ((KANBAN_COLUMNS as readonly string[]).includes(estado)) return estado as KanbanStatus;
  return etapaPorNome(areaId, estado)?.equivale || globalDeQualquerArea(estado);
}

/**
 * A coluna global de uma etapa, sem saber de que área ela é.
 *
 * Os nomes de etapa são específicos o bastante para isso — "Exame de mérito"
 * só existe no INPI — e assim as dezenas de lugares que já perguntavam "este
 * card está finalizado?" continuam valendo sem ter que carregar a área até lá.
 */
export function globalDeQualquerArea(estado?: string): KanbanStatus | null {
  if (!estado) return null;
  if ((KANBAN_COLUMNS as readonly string[]).includes(estado)) return estado as KanbanStatus;
  for (const etapas of Object.values(POR_AREA)) {
    const achada = etapas.find((e) => e.nome === estado);
    if (achada) return achada.equivale;
  }
  return null;
}

/**
 * Em que etapa da área este card está.
 *
 * Card criado antes de a área ganhar etapas próprias guarda uma das sete
 * colunas globais; aqui ele cai na primeira etapa que equivale a ela, para
 * aparecer em algum lugar do quadro em vez de sumir.
 */
export function etapaDoItem(item: Item, areaId: string): string {
  const etapas = etapasDaArea(areaId);
  const guardado = String(item.kanbanStatus || "");
  if (etapas.some((e) => e.nome === guardado)) return guardado;

  const global = guardado || item.status || "";
  const equivalente = etapas.find((e) => e.equivale === global);
  return equivalente?.nome || etapas[0].nome;
}

/**
 * Casa o nome de uma lista de fora com uma etapa da área.
 *
 * O quadro de Marcas do Trello chama "Exame Formal", "Período de Oposição",
 * "Deferidas" — a mesma coisa que as etapas daqui, escrita com outra caixa,
 * no plural ou com uma palavra a mais. Compara sem acento e sem caixa, depois
 * sem o plural, e por fim aceita que uma contenha a outra.
 */
export function etapaDaLista(areaId: string, nomeDaLista: string): string | null {
  const limpo = (t: string) =>
    String(t || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const semPlural = (t: string) => limpo(t).replace(/S\b/g, "");
  const alvo = limpo(nomeDaLista);
  if (!alvo) return null;

  const etapas = etapasDaArea(areaId);
  const exata = etapas.find((e) => limpo(e.nome) === alvo);
  if (exata) return exata.nome;
  const plural = etapas.find((e) => semPlural(e.nome) === semPlural(nomeDaLista));
  if (plural) return plural.nome;
  // "Período de Oposição" contém "Oposição". Exige alguma extensão para que
  // uma etapa de nome curto não engula qualquer lista.
  const dentro = etapas.find((e) => limpo(e.nome).length >= 5 && alvo.includes(limpo(e.nome)));
  return dentro?.nome || null;
}

/** O estado antigo de cinco valores, que algumas telas ainda leem. */
export function statusLegado(equivalente: KanbanStatus): string {
  if (equivalente === "Finalizado") return "Concluído";
  if (equivalente === "Suspenso") return "Pausado";
  if (equivalente === "A Fazer") return "Não iniciado";
  return "Em andamento";
}
