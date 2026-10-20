// Operações sobre o dashboard_state, em vez do JSON inteiro.
//
// Gravar o estado inteiro tinha dois defeitos. O primeiro é o tamanho: cada
// tecla subia ~470KB. O segundo é pior: quem gravava por último apagava o que
// os outros tinham gravado no meio, sem aviso. Duas pessoas mexendo em cards
// diferentes no mesmo segundo bastava para uma das edições sumir.
//
// Aqui a edição vira uma lista curta de operações — "troque o nome do item X",
// "tire o comentário Y" — e o banco aplica essa lista em cima da versão que
// ele tem, com a linha travada. Cada operação aponta pelo id, não pela posição:
// se alguém inseriu um card antes do meu enquanto eu editava, a minha edição
// continua caindo no card certo.
//
// O Trello faz o mesmo: grava só o campo que mudou e manda para os outros só a
// diferença. A função espelho em SQL está em
// supabase/migrations/20261020000000_operacoes_dashboard.sql; as duas precisam
// dar o mesmo resultado, e os testes de sincronizacao.unit.test.ts conferem
// o lado daqui.

/** Um passo do caminho: chave de objeto, ou o elemento de uma lista pelo id. */
export type Passo = string | { id: string };

export type Operacao =
  /** Põe o valor no caminho. Num passo por id que não existe, acrescenta no fim. */
  | { op: "set"; caminho: Passo[]; valor: unknown }
  /** Tira o que está no caminho. Se já não estiver lá, não faz nada. */
  | { op: "remove"; caminho: Passo[] }
  /** Reordena a lista do caminho pelos ids; quem não estiver na lista vai para o fim. */
  | { op: "ordem"; caminho: Passo[]; ids: string[] };

type Objeto = Record<string, unknown>;

function ehObjeto(v: unknown): v is Objeto {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Lista em que todo elemento é objeto com id texto, sem repetição.
 *
 * Só essas são comparadas elemento a elemento. Lista de textos, ou de objetos
 * sem id, é tratada como valor único: mudou qualquer coisa, regrava a lista.
 */
function ehListaComId(v: unknown[]): boolean {
  const vistos = new Set<string>();
  for (const e of v) {
    if (!ehObjeto(e) || typeof e.id !== "string" || vistos.has(e.id)) return false;
    vistos.add(e.id);
  }
  return true;
}

export function iguais(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!iguais(a[i], b[i])) return false;
    return true;
  }
  if (ehObjeto(a)) {
    if (!ehObjeto(b)) return false;
    // undefined não existe em JSON: chave com undefined conta como ausente.
    const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of chaves) if (!iguais(a[k], b[k])) return false;
    return true;
  }
  return false;
}

/** O que mudou de `antes` para `depois`, como operações. */
export function diferenca(antes: unknown, depois: unknown): Operacao[] {
  const ops: Operacao[] = [];
  comparar(antes, depois, [], ops);
  return ops;
}

function comparar(antes: unknown, depois: unknown, caminho: Passo[], ops: Operacao[]) {
  if (antes === depois) return;

  if (ehObjeto(antes) && ehObjeto(depois)) {
    for (const k of Object.keys(antes)) {
      if (antes[k] !== undefined && depois[k] === undefined) {
        ops.push({ op: "remove", caminho: [...caminho, k] });
      }
    }
    for (const k of Object.keys(depois)) {
      if (depois[k] === undefined) continue;
      if (antes[k] === undefined)
        ops.push({ op: "set", caminho: [...caminho, k], valor: depois[k] });
      else comparar(antes[k], depois[k], [...caminho, k], ops);
    }
    return;
  }

  if (
    Array.isArray(antes) &&
    Array.isArray(depois) &&
    ehListaComId(antes) &&
    ehListaComId(depois)
  ) {
    const idsDepois = new Set(depois.map((e) => (e as Objeto).id as string));
    const porId = new Map(antes.map((e) => [(e as Objeto).id as string, e]));

    for (const id of porId.keys()) {
      if (!idsDepois.has(id)) ops.push({ op: "remove", caminho: [...caminho, { id }] });
    }
    for (const e of depois) {
      const id = (e as Objeto).id as string;
      if (porId.has(id)) comparar(porId.get(id), e, [...caminho, { id }], ops);
      else ops.push({ op: "set", caminho: [...caminho, { id }], valor: e });
    }

    // As operações acima deixam a lista com os que ficaram na ordem antiga e
    // os novos no fim. Se não é essa a ordem pedida, alguém arrastou.
    const ficaram = [...porId.keys()].filter((id) => idsDepois.has(id));
    const novos = [...idsDepois].filter((id) => !porId.has(id));
    const resultado = [...ficaram, ...novos];
    const pedida = [...idsDepois];
    if (resultado.some((id, i) => id !== pedida[i])) {
      ops.push({ op: "ordem", caminho, ids: pedida });
    }
    return;
  }

  if (!iguais(antes, depois)) ops.push({ op: "set", caminho, valor: depois });
}

function reordenar(lista: unknown, ids: string[]): unknown {
  if (!Array.isArray(lista)) return lista;
  const pos = new Map(ids.map((id, i) => [id, i]));
  const naLista: unknown[] = [];
  const fora: unknown[] = [];
  for (const e of lista) {
    if (ehObjeto(e) && typeof e.id === "string" && pos.has(e.id)) naLista.push(e);
    else fora.push(e);
  }
  naLista.sort(
    (a, b) => pos.get((a as Objeto).id as string)! - pos.get((b as Objeto).id as string)!,
  );
  const nova = [...naLista, ...fora];
  return nova.every((e, i) => e === lista[i]) ? lista : nova;
}

/**
 * Aplica uma operação, devolvendo um novo estado e reaproveitando o que não mudou.
 *
 * Se o caminho não existe mais — o card foi apagado por outra pessoa enquanto
 * eu editava — a operação é descartada em silêncio. Não há o que fazer com
 * ela, e recriar meio card seria pior.
 */
function aplicarEm(no: unknown, op: Operacao, i: number): unknown {
  const { caminho } = op;
  if (i === caminho.length) {
    if (op.op === "set") return op.valor;
    if (op.op === "ordem") return reordenar(no, op.ids);
    return no;
  }
  const passo = caminho[i];
  const ultimo = i === caminho.length - 1;

  if (typeof passo === "string") {
    if (!ehObjeto(no)) return no;
    if (ultimo && op.op === "remove") {
      if (!(passo in no)) return no;
      const resto = { ...no };
      delete resto[passo];
      return resto;
    }
    if (ultimo && op.op === "set") return { ...no, [passo]: op.valor };
    if (!(passo in no)) return no;
    const filho = aplicarEm(no[passo], op, i + 1);
    return filho === no[passo] ? no : { ...no, [passo]: filho };
  }

  if (!Array.isArray(no)) return no;
  const idx = no.findIndex((e) => ehObjeto(e) && e.id === passo.id);
  if (ultimo && op.op === "remove") return idx < 0 ? no : no.filter((_, j) => j !== idx);
  if (ultimo && op.op === "set") {
    if (idx < 0) return [...no, op.valor];
    const copia = no.slice();
    copia[idx] = op.valor;
    return copia;
  }
  if (idx < 0) return no;
  const filho = aplicarEm(no[idx], op, i + 1);
  if (filho === no[idx]) return no;
  const copia = no.slice();
  copia[idx] = filho;
  return copia;
}

export function aplicar<T>(doc: T, ops: readonly Operacao[]): T {
  let atual: unknown = doc;
  for (const op of ops) atual = aplicarEm(atual, op, 0);
  return atual as T;
}
