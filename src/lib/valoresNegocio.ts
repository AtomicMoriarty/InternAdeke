// Valores em R$ dos negócios, fora do dashboard_state.
//
// O valor de cada negócio morava dentro do JSON que todo usuário logado baixa
// inteiro. A permissão pode_ver_valores só escondia o número na tela: qualquer
// um abria as ferramentas do navegador e lia os honorários do escritório.
//
// Agora o valor mora na tabela valores_negocio, e o próprio banco só entrega
// as linhas para quem pode ver (RLS). As telas não mudaram: a loja do
// dashboard desvia para a tabela toda operação que mexe no campo valor de um
// negócio, e sobrepõe os valores na hora de mostrar. Quem não pode ver recebe
// a tabela vazia, e o JSON não tem mais o número.

import type { Operacao, Passo } from "./sincronizacao";

export const CAMPO_VALOR_NEGOCIO = "valor";

/**
 * Onde moram os negócios no estado: área comercial → cliente → plano → item.
 * "*" é qualquer elemento da lista; o item é o último passo.
 */
const ATE_O_NEGOCIO: (string | { id: string } | "*")[] = [
  "areas",
  { id: "comercial" },
  "clientes",
  "*",
  "planos",
  "*",
  "items",
  "*",
];

export type MudancaValor = { itemId: string; valor: number | null };

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function casa(passo: Passo, padrao: (typeof ATE_O_NEGOCIO)[number]) {
  if (padrao === "*") return typeof passo === "object";
  if (typeof padrao === "string") return passo === padrao;
  return typeof passo === "object" && passo.id === padrao.id;
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

/** O que estiver gravado — número, ou texto antigo do JSON — como número. */
export function numeroDoValor(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return typeof v === "string" ? lerValor(v) : 0;
}

/**
 * Tira os valores de um pedaço do estado que está sendo gravado inteiro — um
 * negócio novo, um cliente com os seus planos — e devolve os dois separados.
 */
function extrair(no: unknown, resto: typeof ATE_O_NEGOCIO, achados: MudancaValor[]): unknown {
  if (resto.length === 0) {
    if (!ehObjeto(no) || typeof no.id !== "string" || !(CAMPO_VALOR_NEGOCIO in no)) return no;
    const { [CAMPO_VALOR_NEGOCIO]: valor, ...semValor } = no;
    achados.push({ itemId: no.id, valor: numeroDoValor(valor) });
    return semValor;
  }
  const [padrao, ...depois] = resto;
  if (padrao !== "*" && typeof padrao === "string") {
    if (!ehObjeto(no) || !(padrao in no)) return no;
    const filho = extrair(no[padrao], depois, achados);
    return filho === no[padrao] ? no : { ...no, [padrao]: filho };
  }
  if (!Array.isArray(no)) return no;
  let mudou = false;
  const lista = no.map((e) => {
    if (padrao !== "*" && !(ehObjeto(e) && e.id === padrao.id)) return e;
    const novo = extrair(e, depois, achados);
    if (novo !== e) mudou = true;
    return novo;
  });
  return mudou ? lista : no;
}

/**
 * Separa as operações: o que é valor de negócio vai para a tabela, o resto
 * segue para o dashboard_state, já sem nenhum valor dentro.
 */
export function separarValores(ops: Operacao[]): { ops: Operacao[]; valores: MudancaValor[] } {
  const fica: Operacao[] = [];
  const valores: MudancaValor[] = [];

  for (const op of ops) {
    const c = op.caminho;
    const n = ATE_O_NEGOCIO.length;
    const prefixoCasa = c.slice(0, n).every((p, i) => casa(p, ATE_O_NEGOCIO[i]));
    if (!prefixoCasa) {
      fica.push(op);
      continue;
    }

    // Mexeu no campo valor de um negócio.
    if (c.length === n + 1 && c[n] === CAMPO_VALOR_NEGOCIO) {
      const itemId = (c[n - 1] as { id: string }).id;
      if (op.op === "set") valores.push({ itemId, valor: numeroDoValor(op.valor) });
      else if (op.op === "remove") valores.push({ itemId, valor: null });
      continue;
    }

    // Negócio apagado: o valor dele vai junto.
    if (c.length === n && op.op === "remove") {
      valores.push({ itemId: (c[n - 1] as { id: string }).id, valor: null });
      fica.push(op);
      continue;
    }

    // Gravando um pedaço que contém negócios inteiros: tira os valores de dentro.
    if (c.length <= n && op.op === "set") {
      const achados: MudancaValor[] = [];
      const valor = extrair(op.valor, ATE_O_NEGOCIO.slice(c.length), achados);
      valores.push(...achados);
      fica.push(valor === op.valor ? op : { ...op, valor });
      continue;
    }

    fica.push(op);
  }
  return { ops: fica, valores };
}

/** Põe os valores da tabela nos negócios, para as telas lerem como sempre leram. */
export function sobreporValores<T>(data: T, valores: ReadonlyMap<string, number>): T {
  if (!valores.size) return data;
  const sobrepor = (no: unknown, resto: typeof ATE_O_NEGOCIO): unknown => {
    if (resto.length === 0) {
      if (!ehObjeto(no) || typeof no.id !== "string" || !valores.has(no.id)) return no;
      const v = valores.get(no.id);
      return no[CAMPO_VALOR_NEGOCIO] === v ? no : { ...no, [CAMPO_VALOR_NEGOCIO]: v };
    }
    const [padrao, ...depois] = resto;
    if (padrao !== "*" && typeof padrao === "string") {
      if (!ehObjeto(no) || !(padrao in no)) return no;
      const filho = sobrepor(no[padrao], depois);
      return filho === no[padrao] ? no : { ...no, [padrao]: filho };
    }
    if (!Array.isArray(no)) return no;
    let mudou = false;
    const lista = no.map((e) => {
      if (padrao !== "*" && !(ehObjeto(e) && e.id === padrao.id)) return e;
      const novo = sobrepor(e, depois);
      if (novo !== e) mudou = true;
      return novo;
    });
    return mudou ? lista : no;
  };
  return sobrepor(data, ATE_O_NEGOCIO) as T;
}
