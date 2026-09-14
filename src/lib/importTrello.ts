// Importação de um quadro do Trello.
//
// O escritório tocou Societário e Contratos no Trello por muito tempo. São
// centenas de cards com histórico real: quem estava com o quê, o que já foi
// entregue, o que está parado esperando o cliente. Recadastrar isso à mão não
// ia acontecer, e sem isso o quadro novo começaria vazio e mentindo.
//
// O que torna o aproveitamento possível é que as listas do Trello são
// exatamente as sete colunas daqui, e que o time escrevia o nome do cliente no
// título do card, antes de um separador. Então dá para reconstruir cliente,
// coluna, responsável, prazo, checklist e comentários sem adivinhar nada.
//
// A leitura é separada da gravação de propósito: lerTrello() só entende o
// arquivo e devolve o que encontrou, para a tela mostrar antes de escrever.
// Nada entra no estado sem a pessoa conferir o que vai entrar.

import type { DashboardState, Area, Cliente, Item, Comentario } from "@/lib/dashboardTypes";
import { KANBAN_COLUMNS, type KanbanStatus } from "@/lib/flattenItems";
import { AREAS } from "@/lib/areas";
import {
  CAMPO_VINCULO,
  clienteNovo,
  diretorio,
  salvarCliente,
  type ClienteDiretorio,
} from "@/lib/diretorioClientes";

/** Plano onde tudo que vem do Trello cai, para ficar fácil de achar e desfazer. */
export const PLANO_IMPORTADO = "Importado do Trello";

/** Cliente para os cards que não têm empresa no título: tarefa interna. */
export const NOME_SEM_CLIENTE = "Interno (sem cliente)";

// ─── Formato do arquivo ──────────────────────────────────────────────────────

type TrelloLabel = { id: string; name: string; color?: string };
type TrelloMember = { id: string; fullName?: string; username?: string };
type TrelloCheckItem = { id: string; name: string; state?: string };
type TrelloChecklist = { id: string; idCard: string; checkItems?: TrelloCheckItem[] };
type TrelloAction = {
  type: string;
  date?: string;
  idMemberCreator?: string;
  data?: { idCard?: string; text?: string };
};
type TrelloCard = {
  id: string;
  name?: string;
  desc?: string;
  due?: string | null;
  start?: string | null;
  closed?: boolean;
  idList?: string;
  idMembers?: string[];
  idLabels?: string[];
  shortUrl?: string;
  dateLastActivity?: string;
  attachments?: { name?: string; url?: string }[];
};
type TrelloBoard = {
  name?: string;
  lists?: { id: string; name?: string; closed?: boolean }[];
  cards?: TrelloCard[];
  labels?: TrelloLabel[];
  members?: TrelloMember[];
  checklists?: TrelloChecklist[];
  actions?: TrelloAction[];
};

// ─── Utilidades ──────────────────────────────────────────────────────────────

function idCurto(prefixo: string) {
  return `${prefixo}${Math.random().toString(36).slice(2, 9)}`;
}

/** Chave de comparação: sem acento, sem caixa, sem pontuação. */
export function chaveNome(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function semAcento(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

function dataBR(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// ─── Cliente no título do card ───────────────────────────────────────────────

/**
 * Separadores usados no quadro, em ordem de confiança.
 *
 * O combinado era "CLIENTE | DEMANDA", mas na prática o pipe virou "l"
 * minúsculo em boa parte dos cards — quem digita rápido erra a tecla e ninguém
 * nunca voltou para arrumar. Esses dois são convenção: o que vem antes é
 * cliente, ponto. Já ":" e "-" aparecem também dentro de títulos comuns
 * ("CERTIDÃO DE ÔNUS REAIS - RGI"), então sozinhos não bastam.
 */
const SEPARADORES: { re: RegExp; confiavel: boolean }[] = [
  { re: /^\s*(.{2,40}?)\s*\|\s*(.+)$/, confiavel: true },
  { re: /^\s*(.{2,40}?)\s+l\s+(.+)$/, confiavel: true },
  { re: /^\s*(.{2,40}?)\s*:\s*(.+)$/, confiavel: false },
  { re: /^\s*(.{2,40}?)\s+[-–]\s+(.+)$/, confiavel: false },
];

type Candidato = { prefixo: string; demanda: string; confiavel: boolean };

function separarTitulo(nome: string): Candidato | null {
  for (const { re, confiavel } of SEPARADORES) {
    const m = re.exec(nome);
    if (!m) continue;
    const prefixo = m[1].trim();
    const demanda = m[2].trim();
    if (!chaveNome(prefixo) || !demanda) continue;
    return { prefixo, demanda, confiavel };
  }
  return null;
}

// ─── Colunas ─────────────────────────────────────────────────────────────────

const POR_COLUNA = new Map<string, KanbanStatus>(
  KANBAN_COLUMNS.map((c) => [semAcento(c), c] as [string, KanbanStatus]),
);

/** Nomes que o quadro do Trello usava e que não batem letra a letra. */
const APELIDOS: Record<string, KanbanStatus> = {
  "A FAZER": "A Fazer",
  TODO: "A Fazer",
  "TO DO": "A Fazer",
  "EM ANDAMENTO": "Em Andamento",
  DOING: "Em Andamento",
  "PENDENCIA INTERNA": "Pendência Interna",
  "PENDENCIA CLIENTE": "Pendência Cliente",
  "EM ANALISE": "Em Andamento",
  "AGUARDANDO INTERNO": "Pendência Interna",
  "AGUARDANDO CLIENTE": "Pendência Cliente",
  "PENDENCIA DO CLIENTE": "Pendência Cliente",
  MONITORAMENTO: "Monitoramento",
  ACOMPANHAMENTO: "Monitoramento",
  FINALIZADO: "Finalizado",
  FINALIZADOS: "Finalizado",
  FINALIZADAS: "Finalizado",
  CONCLUIDO: "Finalizado",
  CONCLUIDOS: "Finalizado",
  CONCLUIDAS: "Finalizado",
  DONE: "Finalizado",
  SUSPENSO: "Suspenso",
  SUSPENSOS: "Suspenso",
  SUSPENSAS: "Suspenso",
};

export function colunaDaLista(nome: string): KanbanStatus | null {
  const k = semAcento(nome);
  return POR_COLUNA.get(k) || APELIDOS[k] || null;
}

// ─── Área de destino ─────────────────────────────────────────────────────────

/**
 * Adivinha a área pelo nome do quadro.
 *
 * "Societário e Contratos - To Do" cai em Societário, "INPI" em INPI & Marcas.
 * É só o valor inicial do seletor: quem importa confere antes de gravar.
 */
export function areaDoQuadro(nomeDoQuadro: string): string | null {
  // Compara pelo radical, sem o plural, porque o quadro se chama "Registros de
  // Marca" e a área, "INPI & Marcas". O S é maiúsculo: semAcento() já passou
  // tudo para caixa alta.
  const radical = (w: string) => w.replace(/S$/, "");
  const palavrasDe = (texto: string, minimo: number) =>
    semAcento(texto)
      .split(/[^A-Z0-9]+/)
      .filter((w) => w.length >= minimo)
      .map(radical);

  const noQuadro = new Set(palavrasDe(nomeDoQuadro, 1));
  for (const a of AREAS) {
    if (a.id === "comercial") continue;
    if (palavrasDe(`${a.modulo} ${a.name}`, 4).some((w) => noQuadro.has(w))) return a.id;
  }
  return null;
}

/** Áreas que podem receber uma importação. */
export const AREAS_DESTINO = AREAS.filter((a) => a.id !== "comercial");

// ─── Societário ou Contratos ─────────────────────────────────────────────────

const RE_CONTRATO =
  /(contrat|aditiv|minuta|distrato|rescis|nda\b|confidencialidad|licenciament|parceria|termos? de uso|prestacao de servic|prestação de serviç|acordo)/i;

/**
 * O quadro misturava Societário e Contratos; aqui são duas áreas.
 *
 * O palpite olha o texto da demanda, não o do cliente: "INCRÍVEL | 7º aditivo"
 * é contrato, "INCRÍVEL | alteração de contrato social" é societário — e por
 * isso "contrato social" é exceção explícita.
 */
export function areaSugerida(demanda: string): "societario" | "contratos" {
  const t = semAcento(demanda);
  if (/CONTRATO SOCIAL|ALTERACAO SOCIAL|QUADRO SOCIETARIO/.test(t)) return "societario";
  return RE_CONTRATO.test(demanda) ? "contratos" : "societario";
}

// ─── Etiquetas ───────────────────────────────────────────────────────────────

const COR_TRELLO: Record<string, string> = {
  red: "#EF4444",
  orange: "#F97316",
  yellow: "#F59E0B",
  green: "#10B981",
  green_dark: "#10B981",
  sky: "#06B6D4",
  blue: "#3B82F6",
  purple: "#8B5CF6",
  purple_dark: "#8B5CF6",
  pink: "#EC4899",
  lime: "#0DD3C5",
  black: "#64748B",
};

// ─── Leitura ─────────────────────────────────────────────────────────────────

export type CartaoLido = {
  trelloId: string;
  titulo: string;
  /** Chave do prefixo achado no título, ou null quando não havia separador. */
  clienteChave: string | null;
  /**
   * O prefixo foi aceito como empresa sem precisar de ninguém confirmar?
   *
   * Falso quando veio de ":" ou "-" e apareceu uma vez só. Esses viram sugestão
   * na tela em vez de cliente: "ALPHASHARK: CONSTITUIÇÃO HOLDINGS" é empresa,
   * "PESQUISA: securitizadora" não é, e só quem trabalhou no quadro sabe.
   */
  aceitoAuto: boolean;
  /** O título sem o prefixo, para quando o prefixo virar cliente. */
  demandaSemCliente: string;
  lista: string;
  /** Coluna reconhecida pelo nome da lista, ou null se a lista não bate. */
  coluna: KanbanStatus | null;
  descricao: string;
  dataInicio: string;
  prazo: string;
  membros: string[];
  etiquetas: { id: string; label: string; color: string }[];
  checklist: { id: string; text: string; done: boolean }[];
  comentarios: { texto: string; autorTrello: string; data: string }[];
  anexos: { name: string; url: string }[];
  url: string;
  arquivado: boolean;
};

export type ClienteLido = {
  chave: string;
  /** Nome escolhido entre as variantes encontradas. */
  nome: string;
  variantes: string[];
  cartoes: number;
  /** Entrou sozinho (separador confiável ou repetido) ou é só uma sugestão? */
  auto: boolean;
};

export type PessoaLida = { trelloId: string; nome: string; username: string };

/** Uma lista do quadro e para onde ela vai. */
export type ListaLida = { nome: string; cartoes: number; coluna: KanbanStatus | null };

export type LeituraTrello = {
  quadro: string;
  cartoes: CartaoLido[];
  /** Empresas reconhecidas sozinhas. Já vêm marcadas para importar. */
  clientes: ClienteLido[];
  /** Prefixos duvidosos. Ficam desmarcados até alguém dizer que são empresa. */
  sugestoes: ClienteLido[];
  pessoas: PessoaLida[];
  /**
   * As listas do quadro, com quantos cards cada uma tem.
   *
   * As que não casam com nenhuma coluna ficam com coluna null: no quadro de
   * Societário as sete bateram sozinhas, mas outro quadro pode ter "BACKLOG"
   * ou "AGUARDANDO CARTÓRIO", e aí alguém precisa dizer onde isso entra — em
   * vez de perder os cards em silêncio.
   */
  listas: ListaLida[];
  /** Cards que entram como trabalho interno se ninguém promover o prefixo. */
  semCliente: number;
};

/**
 * Entende o arquivo do Trello sem tocar no estado.
 *
 * Levanta erro quando o JSON não parece um quadro: é melhor dizer "esse arquivo
 * não é um quadro do Trello" do que importar zero card em silêncio.
 */
export function lerTrello(bruto: unknown): LeituraTrello {
  const b = (bruto || {}) as TrelloBoard;
  if (!Array.isArray(b.cards) || !Array.isArray(b.lists)) {
    throw new Error("Arquivo sem cards ou listas: não parece a exportação de um quadro do Trello.");
  }

  const nomeDaLista = new Map((b.lists || []).map((l) => [l.id, String(l.name || "")]));
  const labels = new Map((b.labels || []).map((l) => [l.id, l]));
  const pessoas: PessoaLida[] = (b.members || []).map((m) => ({
    trelloId: m.id,
    nome: String(m.fullName || m.username || "Sem nome"),
    username: String(m.username || ""),
  }));
  const nomePessoa = new Map(pessoas.map((p) => [p.trelloId, p.nome]));

  const checklistsPorCard = new Map<string, TrelloChecklist[]>();
  for (const cl of b.checklists || []) {
    const lista = checklistsPorCard.get(cl.idCard) || [];
    lista.push(cl);
    checklistsPorCard.set(cl.idCard, lista);
  }

  const comentariosPorCard = new Map<string, TrelloAction[]>();
  for (const a of b.actions || []) {
    if (a.type !== "commentCard" || !a.data?.idCard || !a.data?.text) continue;
    const lista = comentariosPorCard.get(a.data.idCard) || [];
    lista.push(a);
    comentariosPorCard.set(a.data.idCard, lista);
  }

  // Primeira passada: quem são os candidatos a cliente. Um prefixo separado por
  // ":" ou "-" só conta como empresa se repetir ou se também aparecer depois de
  // um pipe em outro card — senão pedaços de título viram cliente fantasma.
  const contagem = new Map<
    string,
    { n: number; confiaveis: number; variantes: Map<string, number> }
  >();
  const candidatos = new Map<string, Candidato | null>();
  for (const c of b.cards) {
    const cand = separarTitulo(String(c.name || ""));
    candidatos.set(c.id, cand);
    if (!cand) continue;
    const k = chaveNome(cand.prefixo);
    const e = contagem.get(k) || { n: 0, confiaveis: 0, variantes: new Map<string, number>() };
    e.n++;
    if (cand.confiavel) e.confiaveis++;
    e.variantes.set(cand.prefixo, (e.variantes.get(cand.prefixo) || 0) + 1);
    contagem.set(k, e);
  }
  const aceitos = new Set(
    [...contagem.entries()].filter(([, e]) => e.confiaveis > 0 || e.n >= 2).map(([k]) => k),
  );

  const cartoes: CartaoLido[] = [];
  let semCliente = 0;

  for (const c of b.cards) {
    const lista = nomeDaLista.get(String(c.idList)) || "";
    const coluna = colunaDaLista(lista);

    const titulo = String(c.name || "").trim();
    const cand = candidatos.get(c.id) || null;
    const chave = cand ? chaveNome(cand.prefixo) : null;
    const aceitoAuto = Boolean(chave && aceitos.has(chave));
    if (!aceitoAuto) semCliente++;

    const checklist = (checklistsPorCard.get(c.id) || []).flatMap((cl) =>
      (cl.checkItems || []).map((ci) => ({
        id: idCurto("ck"),
        text: String(ci.name || ""),
        done: ci.state === "complete",
      })),
    );

    const comentarios = (comentariosPorCard.get(c.id) || [])
      .slice()
      .sort((x, y) => String(x.date || "").localeCompare(String(y.date || "")))
      .map((a) => ({
        texto: String(a.data?.text || ""),
        autorTrello: nomePessoa.get(String(a.idMemberCreator)) || "Trello",
        data: String(a.date || ""),
      }));

    cartoes.push({
      trelloId: c.id,
      titulo,
      clienteChave: chave,
      aceitoAuto,
      demandaSemCliente: cand ? cand.demanda : titulo,
      lista,
      coluna,
      descricao: String(c.desc || "").trim(),
      dataInicio: dataBR(c.start),
      prazo: dataBR(c.due),
      membros: (c.idMembers || []).slice(),
      etiquetas: (c.idLabels || [])
        .map((id) => labels.get(id))
        .filter((l): l is TrelloLabel => Boolean(l && l.name))
        .map((l) => ({
          id: idCurto("et"),
          label: String(l.name),
          color: COR_TRELLO[String(l.color)] || "#64748B",
        })),
      checklist,
      comentarios,
      anexos: (c.attachments || [])
        .filter((a) => a.url)
        .map((a) => ({ name: String(a.name || a.url), url: String(a.url) })),
      url: String(c.shortUrl || ""),
      arquivado: c.closed === true,
    });
  }

  const lidos: ClienteLido[] = [...contagem.entries()]
    .map(([chave, e]) => {
      const variantes = [...e.variantes.entries()].sort(
        (a, z) => z[1] - a[1] || z[0].length - a[0].length,
      );
      return {
        chave,
        nome: variantes[0][0],
        variantes: variantes.map((v) => v[0]),
        cartoes: cartoes.filter((c) => c.clienteChave === chave).length,
        auto: aceitos.has(chave),
      };
    })
    .filter((c) => c.cartoes > 0)
    .sort((a, z) => z.cartoes - a.cartoes || a.nome.localeCompare(z.nome));

  return {
    quadro: String(b.name || "Quadro do Trello"),
    cartoes,
    clientes: lidos.filter((c) => c.auto),
    sugestoes: lidos.filter((c) => !c.auto),
    pessoas,
    // Pelo nome, e não pelo id: o quadro de Compliance tem duas listas
    // chamadas FINALIZADO, e mostrar a mesma linha duas vezes só confunde.
    listas: [...new Set((b.lists || []).map((lst) => String(lst.name || "")))]
      .map((nome) => ({
        nome,
        cartoes: cartoes.filter((c) => c.lista === nome).length,
        coluna: colunaDaLista(nome),
      }))
      .filter((lst) => lst.cartoes > 0),
    semCliente,
  };
}

// ─── Plano de importação ─────────────────────────────────────────────────────

/**
 * Para onde vai o quadro: o id de uma área, ou "auto".
 *
 * "auto" só faz sentido no quadro que misturava Societário e Contratos, e é
 * ali que ele separa pelo texto da demanda. Nos outros, a área é uma só.
 */
export type DestinoArea = string;
export const DESTINO_AUTO = "auto";

export type PlanoImportacao = {
  /** Para onde vão os cards: uma área só, ou separados pelo texto da demanda. */
  destino: DestinoArea;
  /**
   * Coluna escolhida à mão para uma lista que o nome não resolveu.
   *
   * Lista sem coluna aqui e sem coluna reconhecida fica de fora: um card
   * precisa cair em alguma das sete colunas para existir no quadro.
   */
  colunaPorLista: Record<string, KanbanStatus>;
  incluirFinalizados: boolean;
  incluirArquivados: boolean;
  /**
   * Chaves marcadas para virar cliente. Inclui as sugestões que a pessoa
   * promoveu. Card cujo prefixo não está aqui entra como trabalho interno.
   */
  clientesEscolhidos: string[];
  /** Nome final de cada cliente, editável na tela antes de importar. */
  nomePorChave: Record<string, string>;
  /** Trello member id → id do profile daqui. Sem par, o card fica sem dono. */
  pessoaPorTrelloId: Record<string, string>;
  /** Cards sem empresa reconhecida entram como trabalho interno? */
  incluirSemCliente: boolean;
};

export function planoPadrao(leitura: LeituraTrello): PlanoImportacao {
  // O quadro que mistura as duas áreas é o único em que separar faz sentido;
  // nos outros já começa com a área que o nome do quadro sugere.
  const pelaArea = areaDoQuadro(leitura.quadro);
  const misturado = /contrat/i.test(leitura.quadro) && /societ/i.test(leitura.quadro);
  return {
    // Sem palpite, fica vazio de propósito: chutar uma área faria o quadro de
    // Marcas cair em Compliance sem ninguém notar.
    destino: misturado ? DESTINO_AUTO : pelaArea || "",
    colunaPorLista: {},
    incluirFinalizados: false,
    incluirArquivados: false,
    clientesEscolhidos: leitura.clientes.map((c) => c.chave),
    nomePorChave: Object.fromEntries(
      [...leitura.clientes, ...leitura.sugestoes].map((c) => [c.chave, c.nome]),
    ),
    pessoaPorTrelloId: {},
    incluirSemCliente: true,
  };
}

/**
 * Casa as pessoas do Trello com os perfis daqui pelo nome.
 *
 * Só sugere quando o nome bate inteiro, quando o primeiro e o último batem
 * ("Arthur de Carvalho Fernandes" e "Arthur Fernandes"), ou quando um nome
 * está inteiro dentro do outro com pelo menos duas palavras ("Matheus Mazzoni"
 * e "Matheus Mazzoni Rocha"). As duas palavras são o que impede "Mariana" de
 * casar com a primeira Mariana da lista quando existem duas.
 */
export function casarPessoas(
  leitura: LeituraTrello,
  perfis: { id: string; display_name: string; username?: string }[],
): Record<string, string> {
  const partes = (s: string) => semAcento(s).split(/\s+/).filter(Boolean);
  const out: Record<string, string> = {};
  for (const p of leitura.pessoas) {
    const a = partes(p.nome);
    const achado = perfis.find((perfil) => {
      const b = partes(perfil.display_name);
      if (!a.length || !b.length) return false;
      if (a.join(" ") === b.join(" ")) return true;
      if (a[0] === b[0] && a[a.length - 1] === b[b.length - 1]) return true;
      const [curto, longo] = a.length <= b.length ? [a, b] : [b, a];
      return curto.length >= 2 && curto.every((parte) => longo.includes(parte));
    });
    if (achado) out[p.trelloId] = achado.id;
  }
  return out;
}

/**
 * O cliente que este card vai ter, já contando o que a pessoa marcou.
 *
 * Null quer dizer trabalho interno: ou o título não tinha empresa, ou o prefixo
 * ficou desmarcado. Nos dois casos o card entra com o título inteiro no nome —
 * tirar o prefixo de um card que não tem cliente perderia informação.
 */
/**
 * A coluna em que o card vai cair, já contando o que foi mapeado à mão.
 *
 * Null quer dizer que a lista não virou coluna nenhuma, e aí o card não entra.
 */
export function colunaDoCartao(c: CartaoLido, plano: PlanoImportacao): KanbanStatus | null {
  return plano.colunaPorLista[c.lista] || c.coluna || null;
}

export function clienteDoCartao(c: CartaoLido, plano: PlanoImportacao): string | null {
  if (!c.clienteChave) return null;
  return plano.clientesEscolhidos.includes(c.clienteChave) ? c.clienteChave : null;
}

/** O nome que o card terá: sem o prefixo só quando o prefixo virou cliente. */
export function nomeDoCartao(c: CartaoLido, plano: PlanoImportacao): string {
  return clienteDoCartao(c, plano) ? c.demandaSemCliente : c.titulo;
}

export function areaDoCartao(c: CartaoLido, plano: PlanoImportacao): string {
  if (plano.destino !== DESTINO_AUTO) return plano.destino;
  return areaSugerida(nomeDoCartao(c, plano));
}

/** Os cards que vão entrar, com o plano atual. É o que a prévia conta. */
export function cartoesSelecionados(leitura: LeituraTrello, plano: PlanoImportacao): CartaoLido[] {
  const escolhidos = new Set(plano.clientesEscolhidos);
  return leitura.cartoes.filter((c) => {
    const coluna = colunaDoCartao(c, plano);
    if (!coluna) return false;
    if (c.arquivado && !plano.incluirArquivados) return false;
    if (coluna === "Finalizado" && !plano.incluirFinalizados) return false;
    // Desmarcar uma empresa reconhecida é dizer "não traga esse cliente", e os
    // cards dela ficam de fora. Desmarcar uma sugestão é outra coisa: é dizer
    // "isso não é empresa", e o card continua entrando, como trabalho interno.
    if (c.clienteChave && c.aceitoAuto && !escolhidos.has(c.clienteChave)) return false;
    return clienteDoCartao(c, plano) !== null || plano.incluirSemCliente;
  });
}

export type Previa = {
  total: number;
  porColuna: Record<string, number>;
  porArea: Record<string, number>;
  clientesNovos: number;
  clientesExistentes: number;
  semResponsavel: number;
};

export function previa(
  data: DashboardState | null,
  leitura: LeituraTrello,
  plano: PlanoImportacao,
): Previa {
  const cards = cartoesSelecionados(leitura, plano);
  const porColuna: Record<string, number> = {};
  const porArea: Record<string, number> = {};
  let semResponsavel = 0;
  for (const c of cards) {
    const coluna = colunaDoCartao(c, plano);
    if (coluna) porColuna[coluna] = (porColuna[coluna] || 0) + 1;
    const area = areaDoCartao(c, plano);
    porArea[area] = (porArea[area] || 0) + 1;
    if (!c.membros.some((m) => plano.pessoaPorTrelloId[m])) semResponsavel++;
  }

  const jaTem = new Set(diretorio(data).map((c) => chaveNome(c.nome)));
  const efetivos = cards.map((c) => clienteDoCartao(c, plano));
  const usados = new Set(efetivos.filter(Boolean) as string[]);
  let novos = 0;
  let existentes = 0;
  for (const chave of usados) {
    const nome = plano.nomePorChave[chave] || chave;
    if (jaTem.has(chaveNome(nome))) existentes++;
    else novos++;
  }
  if (efetivos.some((e) => e === null)) {
    if (jaTem.has(chaveNome(NOME_SEM_CLIENTE))) existentes++;
    else novos++;
  }

  return {
    total: cards.length,
    porColuna,
    porArea,
    clientesNovos: novos,
    clientesExistentes: existentes,
    semResponsavel,
  };
}

// ─── Gravação ────────────────────────────────────────────────────────────────

function montarItem(c: CartaoLido, plano: PlanoImportacao, agora: Date): Item {
  const iso = agora.toISOString();
  const coluna = colunaDoCartao(c, plano) || "A Fazer";

  // Lista que não era coluna vira etiqueta. No quadro de Marcas as listas são
  // as etapas do INPI — Exame Formal, Período de Oposição, Exame de Mérito —
  // e jogar as três em "Em Andamento" apagaria justamente o que interessa.
  const etiquetas = c.coluna
    ? c.etiquetas
    : [...c.etiquetas, { id: idCurto("et"), label: c.lista, color: "#6366F1" }];
  const responsaveis = [
    ...new Set(c.membros.map((m) => plano.pessoaPorTrelloId[m]).filter(Boolean)),
  ];

  const rodape: string[] = [];
  if (c.anexos.length) {
    rodape.push("Anexos no Trello:");
    for (const a of c.anexos) rodape.push(`- ${a.name}: ${a.url}`);
  }
  if (c.url) rodape.push(`Card original: ${c.url}`);

  const descricao = [c.descricao, rodape.join("\n")].filter(Boolean).join("\n\n");

  const comentarios: Comentario[] = c.comentarios.map((cm) => ({
    id: idCurto("cm"),
    text: cm.texto,
    autor_id: null,
    autor_nome: cm.autorTrello,
    created_at: cm.data || iso,
    tipo: "observacao",
    importadoDoTrello: true,
  }));

  return {
    id: idCurto("it"),
    name: nomeDoCartao(c, plano) || c.titulo,
    tipo: "Outro",
    responsavel: "",
    responsaveis,
    status: coluna === "Finalizado" ? "Concluído" : "Em andamento",
    kanbanStatus: coluna,
    obs: "",
    descricao,
    prazo: c.prazo,
    dataInicio: c.dataInicio,
    criadoEm: iso,
    statusChangedAt: iso,
    checklist: c.checklist,
    etiquetas,
    comentarios,
    origemTrello: c.trelloId,
  };
}

export type ResultadoImportacao = {
  data: DashboardState;
  clientesCriados: number;
  vinculosCriados: number;
  itensCriados: number;
  /** Cards que já tinham sido importados antes e não entraram de novo. */
  repetidos: number;
};

/**
 * Escreve o que a prévia mostrou.
 *
 * Roda sobre uma cópia do estado e devolve outro estado — nada é mutado no
 * lugar. Importar o mesmo arquivo duas vezes não duplica card: cada item guarda
 * o id do card de origem, e quem já está lá é pulado.
 */
export function importar(
  data: DashboardState,
  leitura: LeituraTrello,
  plano: PlanoImportacao,
  agora: Date = new Date(),
): ResultadoImportacao {
  const cards = cartoesSelecionados(leitura, plano);
  // Ids de card já importados antes, para não repetir.
  const jaImportados = new Set<string>();
  for (const area of (data.areas || []) as Area[]) {
    for (const v of (area.clientes || []) as Cliente[]) {
      for (const pl of v.planos || []) {
        for (const it of pl.items || []) {
          const origem = (it as Item).origemTrello;
          if (typeof origem === "string") jaImportados.add(origem);
        }
      }
    }
  }

  let estado: DashboardState = { ...data };
  let clientesCriados = 0;
  let vinculosCriados = 0;
  let itensCriados = 0;
  let repetidos = 0;

  // Cadastro no diretório, um por cliente, reaproveitando quem já existe.
  const cadastroPorChave = new Map<string, ClienteDiretorio>();
  const doDiretorio = new Map(diretorio(estado).map((c) => [chaveNome(c.nome), c]));

  function cadastroDe(chave: string | null): ClienteDiretorio {
    const k = chave === null ? chaveNome(NOME_SEM_CLIENTE) : chave;
    const existe = cadastroPorChave.get(k);
    if (existe) return existe;

    const nome = chave === null ? NOME_SEM_CLIENTE : plano.nomePorChave[chave] || chave;
    const achado = doDiretorio.get(chaveNome(nome));
    const cadastro = achado || clienteNovo(nome, agora);
    if (!achado) {
      estado = salvarCliente(estado, cadastro);
      doDiretorio.set(chaveNome(nome), cadastro);
      clientesCriados++;
    }
    cadastroPorChave.set(k, cadastro);
    return cadastro;
  }

  // Agrupa por área e por cliente para escrever cada vínculo uma vez só.
  type Balde = { areaId: string; cadastro: ClienteDiretorio; itens: Item[] };
  const baldes = new Map<string, Balde>();

  for (const c of cards) {
    if (jaImportados.has(c.trelloId)) {
      repetidos++;
      continue;
    }
    const areaId = areaDoCartao(c, plano);
    const cadastro = cadastroDe(clienteDoCartao(c, plano));
    const chaveBalde = `${areaId}::${cadastro.id}`;
    const balde = baldes.get(chaveBalde) || { areaId, cadastro, itens: [] };
    balde.itens.push(montarItem(c, plano, agora));
    baldes.set(chaveBalde, balde);
    itensCriados++;
  }

  const areas = ((estado.areas || []) as Area[]).map((a) => ({
    ...a,
    clientes: [...((a.clientes || []) as Cliente[])],
  }));

  for (const balde of baldes.values()) {
    const area = areas.find((a) => a.id === balde.areaId);
    if (!area) continue;

    let vinculo = (area.clientes as Cliente[]).find((v) => v[CAMPO_VINCULO] === balde.cadastro.id);
    if (!vinculo) {
      vinculo = {
        id: idCurto("cli"),
        [CAMPO_VINCULO]: balde.cadastro.id,
        name: balde.cadastro.nome,
        responsaveis: [],
        planos: [],
        canalEtica: false,
      };
      (area.clientes as Cliente[]).push(vinculo);
      vinculosCriados++;
    }

    const planos = [...(vinculo.planos || [])];
    const alvo = planos.find((pl) => pl.name === PLANO_IMPORTADO);
    if (alvo) {
      const i = planos.indexOf(alvo);
      planos[i] = { ...alvo, items: [...(alvo.items || []), ...balde.itens] };
    } else {
      planos.push({
        id: idCurto("pl"),
        name: PLANO_IMPORTADO,
        responsavel: "",
        notas: [],
        items: balde.itens,
      });
    }
    const atualizado = { ...vinculo, planos };
    const idx = (area.clientes as Cliente[]).indexOf(vinculo);
    (area.clientes as Cliente[])[idx] = atualizado;
  }

  return {
    data: { ...estado, areas },
    clientesCriados,
    vinculosCriados,
    itensCriados,
    repetidos,
  };
}
