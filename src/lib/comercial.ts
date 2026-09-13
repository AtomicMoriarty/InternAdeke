// O Comercial visto como funil.
//
// Não é uma estrutura nova: são os mesmos clientes, planos e itens das outras
// áreas, com um vocabulário diferente por cima. Um item do Comercial é um
// negócio; o cliente é a empresa. Por isso o funil não quebra nada — relatórios,
// notificações, /eu e !task continuam enxergando os mesmos cards.
//
// O que muda é o campo de etapa. O kanbanStatus global (as 7 colunas de todas
// as áreas) continua sendo gravado junto, derivado da etapa, para que o Quadro
// Geral e os relatórios não precisem saber que o Comercial existe.

import type { DashboardState, Area, Cliente, Plano, Item } from "@/lib/dashboardTypes";
import type { Profile } from "@/lib/profiles";
import { parseBR } from "@/lib/relatorios";

export const AREA_COMERCIAL = "comercial";

export function ehAreaComercial(areaId: string): boolean {
  return areaId === AREA_COMERCIAL;
}

// ─── Etapas do funil ─────────────────────────────────────────────────────────

export type EtapaDef = {
  id: string;
  nome: string;
  cor: string;
  /** Para onde este estágio aponta nas 7 colunas globais. */
  kanban: string;
};

export const ETAPAS: EtapaDef[] = [
  { id: "prospeccao", nome: "Prospecção", cor: "#8B5CF6", kanban: "A Fazer" },
  { id: "qualificacao", nome: "Qualificação", cor: "#3B82F6", kanban: "Em Andamento" },
  { id: "apresentacao", nome: "Apresentação", cor: "#0DD3C5", kanban: "Em Andamento" },
  { id: "negociacao", nome: "Negociação", cor: "#F59E0B", kanban: "Pendência Cliente" },
  { id: "fechamento", nome: "Fechamento", cor: "#10B981", kanban: "Finalizado" },
  { id: "posVenda", nome: "Pós-venda", cor: "#06B6D4", kanban: "Monitoramento" },
];

export const ETAPA_IDS = ETAPAS.map((e) => e.id);
export const PRIMEIRA_ETAPA = ETAPAS[0].id;

export function etapaPorId(id: string): EtapaDef | undefined {
  return ETAPAS.find((e) => e.id === id);
}

export const CAMPO_ETAPA = "etapaComercial";

/**
 * Em que etapa o negócio está.
 *
 * Cards criados antes do funil existir não têm o campo. Em vez de jogá-los
 * todos na primeira coluna, o kanbanStatus que eles já tinham dá o palpite:
 * um card "Finalizado" nasce em Fechamento, não em Prospecção.
 */
export function etapaDoItem(item: Item): string {
  const salva = item[CAMPO_ETAPA];
  if (typeof salva === "string" && ETAPA_IDS.includes(salva)) return salva;

  const kanban = String(item.kanbanStatus || "");
  if (kanban === "Finalizado") return "fechamento";
  if (kanban === "Monitoramento") return "posVenda";
  if (kanban === "Pendência Cliente") return "negociacao";
  if (kanban === "Em Andamento") return "qualificacao";
  return PRIMEIRA_ETAPA;
}

export type MovimentoEtapa = { de: string; para: string; em: string };

/**
 * Campos a gravar quando o negócio muda de etapa.
 *
 * Grava o kanbanStatus junto porque o resto do sistema lê esse campo, e o
 * histórico porque é dele que sai a taxa de conversão — sem registrar a
 * passagem, não há como saber quantos negócios morreram em cada estágio.
 */
export function mudarEtapa(
  item: Item,
  novaEtapa: string,
  agora: Date = new Date(),
): Record<string, unknown> {
  const def = etapaPorId(novaEtapa);
  if (!def) return {};
  const atual = etapaDoItem(item);
  const iso = agora.toISOString();
  const historico = Array.isArray(item.etapaHistory) ? (item.etapaHistory as MovimentoEtapa[]) : [];

  // Arrastar de volta logo depois é conserto, não regressão: apaga a ida em vez
  // de gravar a volta. Sem isso, testar o quadro inflava a conversão para
  // sempre — cada vai-e-vem contava como uma passagem de verdade pela etapa.
  const ultimo = historico[historico.length - 1];
  const desfazendo =
    ultimo &&
    ultimo.para === atual &&
    ultimo.de === novaEtapa &&
    agora.getTime() - new Date(ultimo.em).getTime() <= JANELA_DESFAZER_MS;

  return {
    [CAMPO_ETAPA]: novaEtapa,
    kanbanStatus: def.kanban,
    etapaChangedAt: iso,
    etapaHistory: desfazendo
      ? historico.slice(0, -1)
      : [...historico, { de: atual, para: novaEtapa, em: iso }],
    // Voltar a mexer num negócio dado como perdido o traz de volta ao funil.
    perdidoEm: null,
    motivoPerda: "",
  };
}

/**
 * Quanto tempo um movimento continua sendo "desfazível".
 *
 * Uma hora: dentro disso, voltar para a etapa anterior é quase sempre corrigir
 * um arrasto errado. Passado esse tempo, voltar é decisão — o negócio regrediu
 * de verdade, e isso precisa ficar registrado.
 */
export const JANELA_DESFAZER_MS = 60 * 60 * 1000;

/**
 * Zera o histórico de etapas, mantendo a etapa atual.
 *
 * Serve para limpar movimento de teste acumulado. A conversão é calculada em
 * cima desse histórico, então um card muito mexido distorce o funil inteiro
 * enquanto há poucos negócios reais.
 */
export function limparTrajetoria(agora: Date = new Date()) {
  return { etapaHistory: [], etapaChangedAt: agora.toISOString() };
}

/** Quantos movimentos de etapa este negócio acumulou. */
export function movimentosDoNegocio(item: Item): number {
  return Array.isArray(item.etapaHistory) ? item.etapaHistory.length : 0;
}

/** Há quantos dias o negócio está parado nesta etapa. */
export function diasNaEtapa(item: Item, agora: Date = new Date()): number | null {
  const marco = item.etapaChangedAt || item.statusChangedAt || item.criadoEm;
  if (!marco) return null;
  const d = new Date(String(marco));
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((agora.getTime() - d.getTime()) / 86400000));
}

// ─── Negócio perdido ─────────────────────────────────────────────────────────
//
// O funil tem seis colunas e nenhuma delas é "Perdido", porque perder não é uma
// etapa — é uma saída. Marcar aqui tira o negócio das colunas sem apagá-lo, e é
// isso que torna a taxa de conversão real: sem saber quantos morreram, todo
// funil parece perfeito.

export function ehPerdido(item: Item): boolean {
  return Boolean(item.perdidoEm);
}

export function marcarPerdido(motivo: string, agora: Date = new Date()) {
  return {
    perdidoEm: agora.toISOString(),
    motivoPerda: String(motivo || "").trim(),
    kanbanStatus: "Suspenso",
  };
}

export function reabrirNegocio(item: Item) {
  const def = etapaPorId(etapaDoItem(item));
  return { perdidoEm: null, motivoPerda: "", kanbanStatus: def?.kanban || "A Fazer" };
}

// ─── Valor ───────────────────────────────────────────────────────────────────
//
// Um número só, em reais, não uma faixa "R$ 30k–60k" como no protótipo antigo.
// Faixa soma mal: seis negócios viram "R$ 180k–420k", que não cabe em nenhuma
// decisão. Quem não sabe o valor exato põe a estimativa e corrige depois.

export const CAMPO_VALOR = "valor";

export function valorDoItem(item: Item): number {
  const v = item[CAMPO_VALOR];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") return lerValor(v);
  return 0;
}

/**
 * Lê o que a pessoa digitou no campo de valor.
 *
 * Aceita "8500", "8.500", "R$ 8.500,00" e "8,5k" porque é assim que se escreve
 * valor com pressa. O ponto é separador de milhar no Brasil, então "8.500" é
 * oito mil e quinhentos, não oito e meio.
 */
export function lerValor(texto: string): number {
  const bruto = String(texto || "")
    .replace(/r\$/gi, "")
    .trim();
  if (!bruto) return 0;

  const temMil = /k\s*$/i.test(bruto) || /\bmil\b/i.test(bruto);
  let corpo = bruto
    .replace(/k\s*$/i, "")
    .replace(/\bmil\b/i, "")
    .trim();

  // Vírgula é decimal; ponto é milhar — salvo quando só há ponto e ele separa
  // exatamente duas casas ("8.50"), caso em que a pessoa quis decimal.
  if (corpo.includes(",")) {
    corpo = corpo.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(corpo) && temMil) {
    // "8.5k" = oito mil e quinhentos
  } else {
    corpo = corpo.replace(/\./g, "");
  }

  const n = parseFloat(corpo.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return temMil ? n * 1000 : n;
}

export function formatarValor(n: number): string {
  if (!n) return "—";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/** Versão curta para caber no topo da coluna: R$ 182 mil. */
export function formatarValorCurto(n: number): string {
  if (!n) return "—";
  if (n >= 1000000)
    return `R$ ${(n / 1000000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 1000) return `R$ ${Math.round(n / 1000).toLocaleString("pt-BR")} mil`;
  return formatarValor(n);
}

/**
 * Quem enxerga valores.
 *
 * Honorário é dado sensível, então o padrão é não ver. A coluna
 * pode_ver_valores é quem manda; enquanto ela não existir no banco, só o admin
 * enxerga — nunca o contrário, para não vazar por engano durante a migração.
 */
export function podeVerValores(profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.pode_ver_valores === true) return true;
  return profile.role === "admin";
}

// ─── Temperatura e origem ────────────────────────────────────────────────────

export const TEMPERATURAS = [
  { id: "quente", nome: "Quente", cor: "#EF4444" },
  { id: "morno", nome: "Morno", cor: "#F59E0B" },
  { id: "frio", nome: "Frio", cor: "#3B82F6" },
];

export const TEMPERATURA_PADRAO = "morno";

export function temperaturaDoItem(item: Item): string {
  const t = item.temperatura;
  return typeof t === "string" && TEMPERATURAS.some((x) => x.id === t) ? t : TEMPERATURA_PADRAO;
}

export function corDaTemperatura(id: string): string {
  return TEMPERATURAS.find((t) => t.id === id)?.cor || "#94A3B8";
}

/** De onde o negócio veio. Alimenta o relatório de origem que mais converte. */
export const ORIGENS = [
  "Carteira",
  "Indicação",
  "Prospecção ativa",
  "Evento",
  "Inbound",
  "Reunião (ata)",
];

// ─── Contatos da empresa ─────────────────────────────────────────────────────
//
// O cliente já tinha dadosEmpresa com um contato só. Comercial fala com várias
// pessoas na mesma empresa — o jurídico, o financeiro, quem assina — e precisa
// saber quem é quem.

export type Contato = {
  id: string;
  nome: string;
  cargo?: string;
  telefone?: string;
  email?: string;
  obs?: string;
};

export function contatosDoCliente(cliente: Cliente | null | undefined): Contato[] {
  const lista = cliente?.contatos;
  return Array.isArray(lista) ? (lista as Contato[]) : [];
}

// ─── Criar negócio ───────────────────────────────────────────────────────────
//
// Antes só dava para criar um negócio indo em Empresas → cliente → plano →
// Adicionar item, o que ninguém adivinha estando no funil. E como o cadastro
// de empresa criava itens sozinho pelo template, apareciam cards que a pessoa
// não tinha criado.

/** O plano onde os negócios de uma empresa moram. */
export const PLANO_NEGOCIOS = "Negócios";

export type NovoNegocio = {
  clienteId: string;
  nome: string;
  etapa?: string;
  valor?: number;
  temperatura?: string;
  origem?: string;
  responsaveis?: string[];
};

function idCurto(prefixo: string) {
  return `${prefixo}${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Cria o negócio dentro da empresa escolhida.
 *
 * Se a empresa ainda não tem onde guardar negócios, o plano é criado na hora —
 * quem está no funil não deveria precisar saber que existe uma camada de plano
 * embaixo.
 */
export function criarNegocio(data: DashboardState, novo: NovoNegocio): DashboardState {
  const agora = new Date();
  const iso = agora.toISOString();
  const etapa = novo.etapa && ETAPA_IDS.includes(novo.etapa) ? novo.etapa : PRIMEIRA_ETAPA;

  const item: Item = {
    id: idCurto("it"),
    name: novo.nome.trim(),
    tipo: "Outro",
    responsavel: "",
    responsaveis: novo.responsaveis || [],
    status: "Não iniciado",
    kanbanStatus: etapaPorId(etapa)?.kanban || "A Fazer",
    obs: "",
    prazo: "",
    dataInicio: `${String(agora.getDate()).padStart(2, "0")}/${String(agora.getMonth() + 1).padStart(2, "0")}/${agora.getFullYear()}`,
    criadoEm: iso,
    statusChangedAt: iso,
    etapaChangedAt: iso,
    checklist: [],
    etiquetas: [],
    [CAMPO_ETAPA]: etapa,
    [CAMPO_VALOR]: novo.valor || 0,
    temperatura: novo.temperatura || TEMPERATURA_PADRAO,
    origem: novo.origem || "",
    etapaHistory: [],
  };

  return {
    ...data,
    areas: (data.areas || []).map((a: Area) => {
      if (a.id !== AREA_COMERCIAL) return a;
      return {
        ...a,
        clientes: (a.clientes || []).map((c: Cliente) => {
          if (c.id !== novo.clienteId) return c;
          const planos = (c.planos || []) as Plano[];
          const alvo = planos.find((pl) => pl.name === PLANO_NEGOCIOS) || planos[0];
          if (!alvo) {
            return {
              ...c,
              planos: [{ id: idCurto("pl"), name: PLANO_NEGOCIOS, notas: [], items: [item] }],
            };
          }
          return {
            ...c,
            planos: planos.map((pl) =>
              pl.id !== alvo.id ? pl : { ...pl, items: [...(pl.items || []), item] },
            ),
          };
        }),
      };
    }),
  };
}

/** As empresas do Comercial, para o seletor de novo negócio. */
export function empresasDoComercial(data: DashboardState): { id: string; nome: string }[] {
  const area = (data?.areas || []).find((a: Area) => a.id === AREA_COMERCIAL);
  return ((area?.clientes || []) as Cliente[])
    .map((c) => ({ id: c.id, nome: c.name || "" }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

// ─── Leitura do funil ────────────────────────────────────────────────────────

export type Negocio = {
  item: Item;
  itemId: string;
  nome: string;
  clienteId: string;
  clienteNome: string;
  planoId: string;
  planoNome: string;
  etapa: string;
  valor: number;
  temperatura: string;
  origem: string;
  perdido: boolean;
  diasParado: number | null;
  responsaveis: string[];
  prazo: string;
};

/** Todos os negócios da área comercial, achatados com o nome da empresa junto. */
export function negociosDoFunil(data: DashboardState, agora: Date = new Date()): Negocio[] {
  const area = (data?.areas || []).find((a: Area) => a.id === AREA_COMERCIAL);
  const out: Negocio[] = [];
  for (const cliente of area?.clientes || []) {
    for (const plano of (cliente as Cliente).planos || []) {
      for (const item of (plano as Plano).items || []) {
        out.push({
          item,
          itemId: item.id,
          nome: item.name || "",
          clienteId: cliente.id,
          clienteNome: cliente.name || "",
          planoId: plano.id,
          planoNome: plano.name || "",
          etapa: etapaDoItem(item),
          valor: valorDoItem(item),
          temperatura: temperaturaDoItem(item),
          origem: typeof item.origem === "string" ? item.origem : "",
          perdido: ehPerdido(item),
          diasParado: diasNaEtapa(item, agora),
          responsaveis: Array.isArray(item.responsaveis) ? item.responsaveis : [],
          prazo: typeof item.prazo === "string" ? item.prazo : "",
        });
      }
    }
  }
  return out;
}

export type ColunaFunil = {
  etapa: EtapaDef;
  negocios: Negocio[];
  total: number;
  quantidade: number;
};

/**
 * Monta as colunas na ordem do funil.
 *
 * Perdidos não entram: eles sairiam somando dinheiro que não existe no topo da
 * coluna. Ficam guardados no item e aparecem na conversão e na lista à parte.
 */
export function montarFunil(negocios: Negocio[]): ColunaFunil[] {
  return ETAPAS.map((etapa) => {
    const doEstagio = negocios.filter((n) => n.etapa === etapa.id && !n.perdido);
    // Mais quente e mais parado primeiro: é o que precisa de atenção hoje.
    const peso: Record<string, number> = { quente: 0, morno: 1, frio: 2 };
    doEstagio.sort(
      (a, b) =>
        (peso[a.temperatura] ?? 1) - (peso[b.temperatura] ?? 1) ||
        (b.diasParado ?? 0) - (a.diasParado ?? 0),
    );
    return {
      etapa,
      negocios: doEstagio,
      quantidade: doEstagio.length,
      total: doEstagio.reduce((s, n) => s + n.valor, 0),
    };
  });
}

// ─── Números do funil ────────────────────────────────────────────────────────

export type ResumoFunil = {
  emAberto: number;
  valorEmAberto: number;
  ganhos: number;
  valorGanho: number;
  perdidos: number;
  valorPerdido: number;
  /** Ganhos sobre ganhos + perdidos, em %. Null quando nada se decidiu ainda. */
  taxaGanho: number | null;
  ticketMedio: number;
};

export function resumoDoFunil(negocios: Negocio[]): ResumoFunil {
  const perdidos = negocios.filter((n) => n.perdido);
  const ganhos = negocios.filter(
    (n) => !n.perdido && (n.etapa === "fechamento" || n.etapa === "posVenda"),
  );
  const abertos = negocios.filter(
    (n) => !n.perdido && n.etapa !== "fechamento" && n.etapa !== "posVenda",
  );
  const decididos = ganhos.length + perdidos.length;
  const valorGanho = ganhos.reduce((s, n) => s + n.valor, 0);

  return {
    emAberto: abertos.length,
    valorEmAberto: abertos.reduce((s, n) => s + n.valor, 0),
    ganhos: ganhos.length,
    valorGanho,
    perdidos: perdidos.length,
    valorPerdido: perdidos.reduce((s, n) => s + n.valor, 0),
    taxaGanho: decididos ? Math.round((ganhos.length / decididos) * 100) : null,
    ticketMedio: ganhos.length ? Math.round(valorGanho / ganhos.length) : 0,
  };
}

export type PassagemEtapa = {
  etapa: EtapaDef;
  /** Quantos negócios já passaram por aqui alguma vez. */
  passaram: number;
  /** Destes, quantos chegaram à etapa seguinte. */
  avancaram: number;
  taxa: number | null;
};

/**
 * Quantos negócios sobrevivem a cada etapa.
 *
 * Lê o etapaHistory, que só existe a partir do momento em que o funil entrou no
 * ar. Negócios antigos que nunca se moveram contam apenas na etapa em que estão
 * — por isso os números começam magros e ficam confiáveis com o uso.
 */
export function conversaoPorEtapa(negocios: Negocio[]): PassagemEtapa[] {
  const passaram = new Map<string, Set<string>>();
  for (const e of ETAPAS) passaram.set(e.id, new Set());

  for (const n of negocios) {
    const historico = Array.isArray(n.item.etapaHistory)
      ? (n.item.etapaHistory as MovimentoEtapa[])
      : [];
    const visitadas = new Set<string>([n.etapa]);
    for (const mov of historico) {
      if (mov?.de) visitadas.add(mov.de);
      if (mov?.para) visitadas.add(mov.para);
    }
    for (const id of visitadas) passaram.get(id)?.add(n.itemId);
  }

  return ETAPAS.map((etapa, i) => {
    const aqui = passaram.get(etapa.id)?.size || 0;
    const proxima = ETAPAS[i + 1];
    const adiante = proxima ? passaram.get(proxima.id)?.size || 0 : 0;
    return {
      etapa,
      passaram: aqui,
      avancaram: proxima ? adiante : 0,
      taxa: proxima && aqui ? Math.round((adiante / aqui) * 100) : null,
    };
  });
}

/** Negócios sem movimento há mais de N dias. O que trava funil é silêncio. */
export function negociosParados(negocios: Negocio[], dias = 14): Negocio[] {
  return negocios
    .filter((n) => !n.perdido && n.etapa !== "posVenda" && (n.diasParado ?? 0) >= dias)
    .sort((a, b) => (b.diasParado ?? 0) - (a.diasParado ?? 0));
}

/** Quanto cada origem trouxe de negócio ganho. Diz onde vale investir tempo. */
export function porOrigem(negocios: Negocio[]) {
  const mapa = new Map<string, { origem: string; total: number; ganhos: number; valor: number }>();
  for (const n of negocios) {
    const chave = n.origem || "Não informada";
    const atual = mapa.get(chave) || { origem: chave, total: 0, ganhos: 0, valor: 0 };
    atual.total += 1;
    if (!n.perdido && (n.etapa === "fechamento" || n.etapa === "posVenda")) {
      atual.ganhos += 1;
      atual.valor += n.valor;
    }
    mapa.set(chave, atual);
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor || b.total - a.total);
}

/** Negócios com prazo vencendo, para o funil não perder data de proposta. */
export function proximosPrazos(negocios: Negocio[], dias = 7, hoje: Date = new Date()) {
  const limite = new Date(hoje.getTime() + dias * 86400000);
  return negocios
    .filter((n) => !n.perdido && n.prazo)
    .map((n) => ({ negocio: n, data: parseBR(n.prazo) }))
    .filter((x) => x.data && x.data <= limite)
    .sort((a, b) => (a.data as Date).getTime() - (b.data as Date).getTime());
}
