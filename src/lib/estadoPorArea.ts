// O estado do escritório dividido por área, uma linha por área no banco.
//
// O dashboard_state é um JSON só, e quem lê uma linha lê a linha inteira: a
// permissão por área (allowed_modules) só existia na tela, e qualquer pessoa
// logada abria as ferramentas do navegador e lia LGPD, Societário e Contratos
// de todos os clientes. Pelo mesmo motivo, cada gravação de qualquer pessoa
// mandava o JSON inteiro (~200KB) para todo mundo pelo tempo real.
//
// O Trello resolve isso com assinatura por quadro: o servidor confere a
// permissão quando o navegador pede para acompanhar um quadro, e depois só
// manda o que mudou nele. Aqui a unidade é a área, e a tabela area_state guarda
// uma linha por área — o RLS decide quem lê cada linha, e o tempo real só
// entrega a quem pode ler.
//
// A forma do estado na tela não muda: as linhas são montadas de volta no mesmo
// DashboardState de sempre, só com as áreas que a pessoa pode ver. As
// operações (sincronizacao.ts) também não mudam: cada uma é encaminhada à linha
// a que pertence. A função espelho em SQL está em
// supabase/migrations/20261022000100_estado_por_area.sql; as duas precisam
// rotear igual, e estadoPorArea.unit.test.ts confere o lado daqui.
//
// Fica sem imports com "@/" para rodar direto no node --test.

import type { Operacao, Passo } from "./sincronizacao.ts";
import type { DashboardState } from "./dashboardTypes";

/** Linha com o que não é de área nenhuma: diretório, templates, atualizações. */
export const LINHA_COMUM = "_comum";
/** Linha dos produtos, que não são área mas têm permissão própria ("produtos"). */
export const LINHA_PRODUTOS = "_produtos";

export type LinhaArea = {
  id: string;
  ordem: number;
  data: unknown;
  marcas?: unknown;
  updated_at?: string | null;
};

type Objeto = Record<string, unknown>;

function ehObjeto(v: unknown): v is Objeto {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function ehPassoId(p: Passo | undefined): p is { id: string } {
  return !!p && typeof p === "object" && typeof (p as { id?: unknown }).id === "string";
}

/** O módulo de permissão de cada linha; null é a linha que todo liberado lê. */
export function moduloDaLinha(id: string): string | null {
  if (id === LINHA_COMUM) return null;
  if (id === LINHA_PRODUTOS) return "produtos";
  return id;
}

/** Divide o estado nas linhas da tabela. Inverso de montarEstado. */
export function dividirEstado(data: DashboardState): LinhaArea[] {
  const { areas, produtos, ...resto } = data;
  const linhas: LinhaArea[] = [];
  (Array.isArray(areas) ? areas : []).forEach((area, i) => {
    if (ehObjeto(area) && typeof area.id === "string") {
      linhas.push({ id: area.id, ordem: i, data: area });
    }
  });
  linhas.push({ id: LINHA_PRODUTOS, ordem: 0, data: { produtos: produtos ?? [] } });
  linhas.push({ id: LINHA_COMUM, ordem: 0, data: resto });
  return linhas;
}

/**
 * Monta o estado da tela a partir das linhas que a pessoa recebeu.
 *
 * A linha de produtos ausente (pessoa sem o módulo) vira lista vazia, e a
 * comum ausente vira objeto vazio: as telas já lidam com os dois.
 */
export function montarEstado(linhas: LinhaArea[]): DashboardState {
  const comum = linhas.find((l) => l.id === LINHA_COMUM);
  const produtos = linhas.find((l) => l.id === LINHA_PRODUTOS);
  const areas = linhas
    .filter((l) => l.id !== LINHA_COMUM && l.id !== LINHA_PRODUTOS && ehObjeto(l.data))
    .sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id))
    .map((l) => l.data as NonNullable<DashboardState["areas"]>[number]);
  const listaProdutos = ehObjeto(produtos?.data) ? (produtos.data as Objeto).produtos : undefined;
  return {
    ...(ehObjeto(comum?.data) ? (comum.data as Objeto) : {}),
    areas,
    produtos: Array.isArray(listaProdutos) ? (listaProdutos as DashboardState["produtos"]) : [],
  };
}

/** Uma operação já encaminhada: em que linha ela cai e com que caminho. */
export type OperacaoRoteada = { linha: string; op: Operacao };

/**
 * Para que linha vai cada operação, e com que caminho dentro dela.
 *
 * - ["areas", {id: X}, ...resto] → linha X, caminho "resto" dentro da área;
 * - ["areas"] com a lista inteira → uma operação por área;
 * - ["produtos", ...] → linha de produtos, caminho igual (ela guarda {produtos});
 * - qualquer outra chave → linha comum, caminho igual;
 * - [] (o estado inteiro) → dividido em todas as linhas.
 *
 * Remover uma área inteira, ou reordenar as áreas, não vira nada: as áreas
 * vêm do código (areas.ts), não de edição.
 */
export function rotear(op: Operacao): OperacaoRoteada[] {
  const [primeiro, segundo, ...resto] = op.caminho;

  if (primeiro === undefined) {
    if (op.op !== "set" || !ehObjeto(op.valor)) return [];
    return dividirEstado(op.valor as DashboardState).map((l) => ({
      linha: l.id,
      op: { op: "set", caminho: [], valor: l.data },
    }));
  }

  if (primeiro === "areas") {
    if (segundo === undefined) {
      if (op.op !== "set" || !Array.isArray(op.valor)) return [];
      return op.valor
        .filter((a): a is Objeto => ehObjeto(a) && typeof a.id === "string")
        .map((a) => ({ linha: a.id as string, op: { op: "set", caminho: [], valor: a } }));
    }
    if (!ehPassoId(segundo)) return [];
    if (resto.length === 0 && op.op !== "set") return [];
    return [{ linha: segundo.id, op: { ...op, caminho: resto } as Operacao }];
  }

  if (primeiro === "produtos") return [{ linha: LINHA_PRODUTOS, op }];
  return [{ linha: LINHA_COMUM, op }];
}

/** As linhas que um lote de operações toca. */
export function linhasDoLote(ops: Operacao[]): Set<string> {
  const linhas = new Set<string>();
  for (const op of ops) for (const r of rotear(op)) linhas.add(r.linha);
  return linhas;
}
