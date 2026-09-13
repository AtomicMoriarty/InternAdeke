import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Notification = {
  id: string;
  user_id: string;
  tipo: "mencao" | "nota_responsavel" | "atribuicao" | "mudanca_status" | "prazo";
  cliente_id: string;
  cliente_nome: string;
  modulo: string;
  plano_id: string;
  plano_nome: string;
  item_id: string | null;
  item_nome: string | null;
  trecho: string | null;
  autor_id: string | null;
  autor_nome: string | null;
  lida: boolean;
  created_at: string;
};

export function useNotifications(userId: string | null) {
  const [list, setList] = useState<Notification[]>([]);
  const scopeRef = useRef(Math.random().toString(36).slice(2, 9));

  useEffect(() => {
    if (!userId) {
      setList([]);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (active) setList((data || []) as Notification[]);
    })();

    const ch = supabase
      .channel(`notif-${userId}-${scopeRef.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          setList((prev) => {
            if (payload.eventType === "INSERT") return [payload.new as Notification, ...prev];
            if (payload.eventType === "UPDATE")
              return prev.map((n) =>
                n.id === (payload.new as { id: string }).id ? (payload.new as Notification) : n,
              );
            if (payload.eventType === "DELETE")
              return prev.filter((n) => n.id !== (payload.old as { id: string }).id);
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [userId]);

  return list;
}

export async function markAllRead(userId: string) {
  await supabase
    .from("notifications")
    .update({ lida: true })
    .eq("user_id", userId)
    .eq("lida", false);
}
export async function markRead(id: string) {
  await supabase.from("notifications").update({ lida: true }).eq("id", id);
}

export type NotifContext = {
  cliente_id: string;
  cliente_nome: string;
  modulo: string;
  plano_id: string;
  plano_nome: string;
  item_id?: string | null;
  item_nome?: string | null;
  autor_id: string | null;
  autor_nome: string;
  trecho: string;
};

export async function emitNotifications(opts: {
  ctx: NotifContext;
  mentionedIds: string[]; // users mentioned via @
  responsibleIds: string[]; // users responsible for the item/plan
}) {
  const { ctx, mentionedIds, responsibleIds } = opts;
  const rows: Record<string, unknown>[] = [];
  const mset = new Set(mentionedIds.filter((id) => id !== ctx.autor_id));
  const rset = new Set(responsibleIds.filter((id) => id !== ctx.autor_id && !mset.has(id)));

  for (const uid of mset) {
    rows.push({ ...baseRow(ctx), user_id: uid, tipo: "mencao" });
  }
  for (const uid of rset) {
    rows.push({ ...baseRow(ctx), user_id: uid, tipo: "nota_responsavel" });
  }
  if (!rows.length) return;
  await supabase.from("notifications").insert(rows as never);
}

function baseRow(ctx: NotifContext) {
  return {
    cliente_id: ctx.cliente_id,
    cliente_nome: ctx.cliente_nome,
    modulo: ctx.modulo,
    plano_id: ctx.plano_id,
    plano_nome: ctx.plano_nome,
    item_id: ctx.item_id || null,
    item_nome: ctx.item_nome || null,
    trecho: ctx.trecho?.slice(0, 240) || null,
    autor_id: ctx.autor_id,
    autor_nome: ctx.autor_nome,
  };
}

export async function emitAtribuicao(opts: {
  newIds: string[];
  oldIds: string[];
  ctx: NotifContext;
}) {
  const added = opts.newIds.filter((id) => !opts.oldIds.includes(id) && id !== opts.ctx.autor_id);
  if (!added.length) return;
  const rows = added.map((uid) => ({ ...baseRow(opts.ctx), user_id: uid, tipo: "atribuicao" }));
  await supabase.from("notifications").insert(rows);
}

export async function emitMudancaStatus(opts: {
  responsibleIds: string[];
  ctx: NotifContext;
  novoStatus: string;
}) {
  const targets = opts.responsibleIds.filter((id) => id !== opts.ctx.autor_id);
  if (!targets.length) return;
  const rows = targets.map((uid) => ({
    ...baseRow(opts.ctx),
    user_id: uid,
    tipo: "mudanca_status",
    trecho: `Novo status: ${opts.novoStatus}`,
  }));
  await supabase.from("notifications").insert(rows);
}

/**
 * Como cada tipo de aviso deve se apresentar.
 *
 * Existem cinco tipos, mas as telas só distinguiam menção — todo o resto
 * aparecia como "Nova nota", inclusive ser atribuído a uma tarefa, que não é
 * nota nenhuma. Centralizar aqui evita que as duas telas divirjam de novo.
 */
export function descreverNotificacao(n: Notification): { titulo: string; cor: string } {
  const quem = n.autor_nome || "Alguém";
  const onde = n.item_nome || n.plano_nome || "um item";
  switch (n.tipo) {
    case "mencao":
      return { titulo: `${quem} mencionou você`, cor: "#8B5CF6" };
    case "atribuicao":
      return { titulo: `${quem} atribuiu "${onde}" a você`, cor: "#0DD3C5" };
    case "mudanca_status":
      return { titulo: `Status de "${onde}" mudou`, cor: "#3B82F6" };
    case "prazo":
      return { titulo: `Prazo de "${onde}"`, cor: "#F97316" };
    case "nota_responsavel":
    default:
      return { titulo: `Nova nota em "${onde}"`, cor: "#0DD3C5" };
  }
}
