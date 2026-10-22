// Lê e grava o estado do escritório, para o navegador e para o worker.
//
// O estado mora em area_state, uma linha por área (estadoPorArea.ts), e é
// gravado por operações: a função aplicar_operacoes_areas aplica só o que
// mudou, com as linhas travadas, e só nas áreas que quem chama pode ver.
//
// Enquanto a migração não chegar ao banco, cai nos jeitos antigos, na ordem:
// a função aplicar_operacoes_dashboard (operações no JSON único) e, sem ela, o
// JSON inteiro. O app nunca fica sem conseguir salvar por causa da ordem em que
// as coisas sobem.

import type { SupabaseClient } from "@supabase/supabase-js";
import { diferenca, type Operacao } from "./sincronizacao";
import { montarEstado, type LinhaArea } from "./estadoPorArea";
import type { DashboardState } from "./dashboardTypes";

export const DASHBOARD_ROW_ID = "main";

type ErroPostgrest = { code?: string; message: string } | null;

/** Serve para o cliente tipado do navegador e para o solto do worker. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClienteSupabase = SupabaseClient<any, any, any>;

export type ResultadoGravacao =
  | { ok: true; jeito: "areas" | "operacoes" | "inteiro" | "nada" }
  | { ok: false; erro: string; permanente: boolean };

/**
 * O banco recusou de vez: sem permissão, dado inválido, operação malformada.
 *
 * Tentar de novo não muda a resposta. Antes, esse lote voltava para a fila e
 * grudava em todos os seguintes, e nada do que a pessoa editasse dali em
 * diante chegava ao banco. Rede caída, tempo esgotado e erro do servidor são
 * passageiros e continuam sendo tentados.
 */
function recusaPermanente(e: ErroPostgrest) {
  const c = e?.code || "";
  return c === "42501" || c === "P0001" || /^2[23]/.test(c);
}

function falha(e: NonNullable<ErroPostgrest>): ResultadoGravacao {
  return { ok: false, erro: e.message, permanente: recusaPermanente(e) };
}

/** A função não existe no banco: PostgREST e Postgres dizem isso de jeitos diferentes. */
function faltaFuncao(e: ErroPostgrest) {
  return !!e && (e.code === "PGRST202" || e.code === "42883");
}

/** Tabela ou coluna que ainda não existe no banco. */
export function faltaNoBanco(e: { code?: string } | null) {
  return !!e && ["42P01", "PGRST205", "PGRST204", "42703"].includes(e.code || "");
}

export function novaMarca() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

/**
 * Manda um lote de operações.
 *
 * `inteiro` só é chamado se nenhuma das funções existir: devolve o JSON a
 * gravar pelo jeito mais antigo. É uma função, e não o valor, para o worker
 * não ter que montar meio mega à toa no caminho normal.
 */
export async function gravarOperacoes(
  supabase: ClienteSupabase,
  ops: Operacao[],
  marca: string,
  inteiro: () => unknown,
): Promise<ResultadoGravacao> {
  if (!ops.length) return { ok: true, jeito: "nada" };

  const porArea = await supabase.rpc("aplicar_operacoes_areas", { p_ops: ops, p_marca: marca });
  if (!porArea.error) return { ok: true, jeito: "areas" };
  if (!faltaFuncao(porArea.error)) return falha(porArea.error);

  const { error } = await supabase.rpc("aplicar_operacoes_dashboard", {
    p_ops: ops,
    p_marca: marca,
    p_id: DASHBOARD_ROW_ID,
  });
  if (!error) return { ok: true, jeito: "operacoes" };
  if (!faltaFuncao(error)) return falha(error);

  const { error: erroInteiro } = await supabase
    .from("dashboard_state")
    .update({ data: inteiro(), updated_at: new Date().toISOString() })
    .eq("id", DASHBOARD_ROW_ID);
  return erroInteiro ? falha(erroInteiro) : { ok: true, jeito: "inteiro" };
}

/** Para quem lê, muda e grava de uma vez — o worker: grava só a diferença. */
export function gravarDiferenca(supabase: ClienteSupabase, antes: unknown, depois: unknown) {
  return gravarOperacoes(supabase, diferenca(antes, depois), novaMarca(), () => depois);
}

export type LeituraEstado =
  { ok: true; data: DashboardState; linhas: LinhaArea[] | null } | { ok: false; erro: string };

/**
 * Lê o estado inteiro que este cliente pode ver.
 *
 * Com a chave de serviço (o worker) são todas as áreas. `linhas` é null quando
 * veio do dashboard_state antigo, antes da migração.
 */
export async function lerEstadoCompleto(supabase: ClienteSupabase): Promise<LeituraEstado> {
  const { data: linhas, error } = await supabase.from("area_state").select("*");
  if (!error && linhas?.length) {
    return { ok: true, data: montarEstado(linhas as LinhaArea[]), linhas: linhas as LinhaArea[] };
  }
  if (error && !faltaNoBanco(error)) return { ok: false, erro: error.message };

  const { data: row, error: erroAntigo } = await supabase
    .from("dashboard_state")
    .select("data")
    .eq("id", DASHBOARD_ROW_ID)
    .maybeSingle();
  if (erroAntigo) return { ok: false, erro: erroAntigo.message };
  if (!row?.data) return { ok: false, erro: "estado vazio" };
  return { ok: true, data: row.data as DashboardState, linhas: null };
}
