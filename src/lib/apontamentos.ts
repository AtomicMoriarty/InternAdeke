// Folha de horas: leitura e gravação dos apontamentos no Supabase.
//
// As contas ficam em tempo.ts; aqui é só ida e volta ao banco e o tempo real.
//
// O cronômetro da pessoa é um só para o app inteiro (o banco garante: um
// apontamento sem fim por pessoa). Ele mora num módulo, como o estado do
// dashboard, para o botão do card, o da checklist e a pílula flutuante
// mostrarem o mesmo relógio — e o tempo real o mantém igual nas outras abas.

import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { faltaNoBanco } from "@/lib/gravarDashboard";
import type { AlvoDoTempo, Apontamento } from "@/lib/tempo";

// A tabela pode ainda não estar nos tipos gerados de quem roda uma versão
// antiga; o cliente solto evita que isso quebre a compilação.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Ouvinte = () => void;

const relogio = {
  userId: null as string | null,
  ativo: null as Apontamento | null,
  /** A tabela existe? Até a migração chegar ao banco, a folha de horas fica oculta. */
  disponivel: null as boolean | null,
  ouvintes: new Set<Ouvinte>(),
  canal: null as ReturnType<typeof supabase.channel> | null,
  carregando: null as Promise<void> | null,
};

function avisar() {
  for (const o of relogio.ouvintes) o();
}

async function carregarCronometro(userId: string) {
  if (relogio.carregando && relogio.userId === userId) return relogio.carregando;
  relogio.userId = userId;
  relogio.carregando = (async () => {
    const { data, error } = await db
      .from("apontamentos")
      .select("*")
      .eq("user_id", userId)
      .is("fim", null)
      .maybeSingle();
    if (error) {
      relogio.disponivel = !faltaNoBanco(error);
      if (relogio.disponivel) console.error("[tempo] cronômetro não carregou:", error.message);
      avisar();
      return;
    }
    relogio.disponivel = true;
    relogio.ativo = (data as Apontamento) || null;
    avisar();
    assinar(userId);
  })().finally(() => {
    relogio.carregando = null;
  });
  return relogio.carregando;
}

function assinar(userId: string) {
  if (relogio.canal) return;
  relogio.canal = supabase
    .channel(`apontamentos-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "apontamentos", filter: `user_id=eq.${userId}` },
      (payload: { eventType: string; new?: Partial<Apontamento>; old?: Partial<Apontamento> }) => {
        const novo = payload.new as Apontamento | undefined;
        if (payload.eventType === "DELETE") {
          if (relogio.ativo && payload.old?.id === relogio.ativo.id) relogio.ativo = null;
        } else if (novo?.id) {
          if (!novo.fim) relogio.ativo = novo;
          else if (relogio.ativo?.id === novo.id) relogio.ativo = null;
        }
        avisar();
        window.dispatchEvent(new CustomEvent("adeke:tempo", { detail: novo || payload.old }));
      },
    )
    .subscribe();
}

/** O cronômetro rodando da pessoa (ou null), igual em todas as telas. */
export function useCronometro(userId: string | null | undefined) {
  const ativo = useSyncExternalStore(
    (o) => {
      relogio.ouvintes.add(o);
      return () => relogio.ouvintes.delete(o);
    },
    () => relogio.ativo,
    () => null,
  );
  const disponivel = useSyncExternalStore(
    (o) => {
      relogio.ouvintes.add(o);
      return () => relogio.ouvintes.delete(o);
    },
    () => relogio.disponivel,
    () => null,
  );
  useEffect(() => {
    if (userId && relogio.userId !== userId) void carregarCronometro(userId);
  }, [userId]);
  return { ativo, disponivel };
}

/** Um segundo de relógio para quem mostra o cronômetro andando. */
export function useAgora(ativo: boolean, passoMs = 1000) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    if (!ativo) return;
    setAgora(new Date());
    const t = setInterval(() => setAgora(new Date()), passoMs);
    return () => clearInterval(t);
  }, [ativo, passoMs]);
  return agora;
}

export type Resultado<T = void> = { ok: true; valor: T } | { ok: false; erro: string };

function traduzirErro(msg: string) {
  if (/apontamento_ate_24h/.test(msg)) return "Um lançamento vai até 24 horas.";
  if (/apontamento_fim_depois/.test(msg)) return "O fim precisa ser depois do início.";
  if (/row-level security|permission/i.test(msg)) return "Sem permissão para isso.";
  return msg;
}

/** Começa a contar. O que estiver rodando é encerrado agora, no banco. */
export async function iniciarCronometro(alvo: AlvoDoTempo, descricao = "") {
  const anterior = relogio.ativo;
  const { data, error } = await db.rpc("iniciar_cronometro", {
    p_apontamento: { ...alvo, descricao },
  });
  if (error) return { ok: false, erro: traduzirErro(error.message) } as Resultado<Apontamento>;
  relogio.ativo = data as Apontamento;
  avisar();
  if (anterior) window.dispatchEvent(new CustomEvent("adeke:tempo", { detail: anterior }));
  window.dispatchEvent(new CustomEvent("adeke:tempo", { detail: data }));
  return { ok: true, valor: data as Apontamento } as Resultado<Apontamento>;
}

/** Para o cronômetro, com o que foi feito. */
export async function pararCronometro(descricao?: string): Promise<Resultado> {
  const ativo = relogio.ativo;
  if (!ativo) return { ok: true, valor: undefined };
  const patch: Record<string, unknown> = { fim: new Date().toISOString() };
  if (descricao !== undefined) patch.descricao = descricao;
  const { error } = await db.from("apontamentos").update(patch).eq("id", ativo.id);
  if (error) return { ok: false, erro: traduzirErro(error.message) };
  relogio.ativo = null;
  avisar();
  window.dispatchEvent(new CustomEvent("adeke:tempo", { detail: ativo }));
  return { ok: true, valor: undefined };
}

/** Lançamento à mão: o dia, de que horas a que horas, o que foi feito. */
export async function lancarTempo(
  alvo: AlvoDoTempo,
  inicio: Date,
  fim: Date,
  descricao: string,
): Promise<Resultado> {
  const { data, error } = await db
    .from("apontamentos")
    .insert({
      ...alvo,
      descricao,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
    })
    .select("*")
    .single();
  if (error) return { ok: false, erro: traduzirErro(error.message) };
  window.dispatchEvent(new CustomEvent("adeke:tempo", { detail: data }));
  return { ok: true, valor: undefined };
}

export async function corrigirTempo(
  id: string,
  patch: Partial<Pick<Apontamento, "inicio" | "fim" | "descricao" | "subitem_id" | "subitem_nome">>,
): Promise<Resultado> {
  const { data, error } = await db.from("apontamentos").update(patch).eq("id", id).select("*");
  if (error) return { ok: false, erro: traduzirErro(error.message) };
  if (!data?.length) return { ok: false, erro: "Sem permissão para isso." };
  if (relogio.ativo?.id === id) {
    relogio.ativo = data[0].fim ? null : data[0];
    avisar();
  }
  window.dispatchEvent(new CustomEvent("adeke:tempo", { detail: data[0] }));
  return { ok: true, valor: undefined };
}

export async function apagarTempo(id: string): Promise<Resultado> {
  const { data, error } = await db.from("apontamentos").delete().eq("id", id).select("id");
  if (error) return { ok: false, erro: traduzirErro(error.message) };
  if (!data?.length) return { ok: false, erro: "Sem permissão para isso." };
  if (relogio.ativo?.id === id) {
    relogio.ativo = null;
    avisar();
  }
  window.dispatchEvent(new CustomEvent("adeke:tempo", { detail: { id } }));
  return { ok: true, valor: undefined };
}

/**
 * Os apontamentos de um card, e os de quem mais estiver nele, atualizados
 * quando alguém lança, corrige ou para um cronômetro.
 */
export function useApontamentosDoItem(itemId: string | null | undefined) {
  const [lista, setLista] = useState<Apontamento[]>([]);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    if (!itemId) return;
    let vivo = true;
    const buscar = async () => {
      const { data, error } = await db
        .from("apontamentos")
        .select("*")
        .eq("item_id", itemId)
        .order("inicio", { ascending: false })
        .limit(1000);
      if (!vivo) return;
      if (!error) setLista((data as Apontamento[]) || []);
      setCarregado(true);
    };
    void buscar();
    // O que esta aba fez chega pelo evento; o que outra pessoa fez, pelo canal.
    const doApp = (e: Event) => {
      const d = (e as CustomEvent).detail as Partial<Apontamento> | undefined;
      // Sem item_id é um apagamento (só vem o id): busca de novo por garantia.
      if (!d?.item_id || d.item_id === itemId) void buscar();
    };
    window.addEventListener("adeke:tempo", doApp);
    const canal = supabase
      .channel(`apontamentos-item-${itemId}-${Math.random().toString(36).slice(2, 7)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "apontamentos", filter: `item_id=eq.${itemId}` },
        () => void buscar(),
      )
      .subscribe();
    return () => {
      vivo = false;
      window.removeEventListener("adeke:tempo", doApp);
      void supabase.removeChannel(canal);
    };
  }, [itemId]);

  return { lista, carregado };
}

/**
 * Apontamentos que começaram no período, para o relatório de horas.
 *
 * Vem em páginas de mil: o PostgREST corta aí, e um mês de escritório pode
 * passar disso.
 */
export async function buscarApontamentos(de: Date, ate: Date): Promise<Resultado<Apontamento[]>> {
  const todos: Apontamento[] = [];
  for (let pagina = 0; pagina < 50; pagina++) {
    const { data, error } = await db
      .from("apontamentos")
      .select("*")
      .gte("inicio", de.toISOString())
      .lt("inicio", ate.toISOString())
      .order("inicio", { ascending: true })
      .range(pagina * 1000, pagina * 1000 + 999);
    if (error) {
      return {
        ok: false,
        erro: faltaNoBanco(error)
          ? "A folha de horas ainda não foi ativada no banco (migração 20261022000300)."
          : error.message,
      };
    }
    todos.push(...((data as Apontamento[]) || []));
    if (!data || data.length < 1000) break;
  }
  return { ok: true, valor: todos };
}
