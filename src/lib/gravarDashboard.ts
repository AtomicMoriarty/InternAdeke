// Grava operações no dashboard_state, para o navegador e para o worker.
//
// O caminho normal é a função aplicar_operacoes_dashboard, que aplica só o que
// mudou com a linha travada. Enquanto ela não existir no banco — migração ainda
// não aplicada — cai no jeito antigo, gravando o JSON inteiro, para que o app
// nunca fique sem conseguir salvar por causa da ordem em que as coisas sobem.

import type { SupabaseClient } from "@supabase/supabase-js";
import { diferenca, type Operacao } from "./sincronizacao";

export const DASHBOARD_ROW_ID = "main";

type ErroPostgrest = { code?: string; message: string } | null;

/** Serve para o cliente tipado do navegador e para o solto do worker. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClienteSupabase = SupabaseClient<any, any, any>;

export type ResultadoGravacao =
  { ok: true; jeito: "operacoes" | "inteiro" | "nada" } | { ok: false; erro: string };

/** A função não existe no banco: PostgREST e Postgres dizem isso de jeitos diferentes. */
function faltaFuncao(e: ErroPostgrest) {
  return !!e && (e.code === "PGRST202" || e.code === "42883");
}

export function novaMarca() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

/**
 * Manda um lote de operações.
 *
 * `inteiro` só é chamado se a função não existir: devolve o JSON a gravar pelo
 * jeito antigo. É uma função, e não o valor, para o worker não ter que montar
 * meio mega à toa no caminho normal.
 */
export async function gravarOperacoes(
  supabase: ClienteSupabase,
  ops: Operacao[],
  marca: string,
  inteiro: () => unknown,
): Promise<ResultadoGravacao> {
  if (!ops.length) return { ok: true, jeito: "nada" };
  const { error } = await supabase.rpc("aplicar_operacoes_dashboard", {
    p_ops: ops,
    p_marca: marca,
    p_id: DASHBOARD_ROW_ID,
  });
  if (!error) return { ok: true, jeito: "operacoes" };
  if (!faltaFuncao(error)) return { ok: false, erro: error.message };

  const { error: erroInteiro } = await supabase
    .from("dashboard_state")
    .update({ data: inteiro(), updated_at: new Date().toISOString() })
    .eq("id", DASHBOARD_ROW_ID);
  return erroInteiro ? { ok: false, erro: erroInteiro.message } : { ok: true, jeito: "inteiro" };
}

/** Para quem lê, muda e grava de uma vez — o worker: grava só a diferença. */
export function gravarDiferenca(supabase: ClienteSupabase, antes: unknown, depois: unknown) {
  return gravarOperacoes(supabase, diferenca(antes, depois), novaMarca(), () => depois);
}
