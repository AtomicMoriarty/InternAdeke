import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

function parsePrazoBR(prazo: string): Date | null {
  const m = prazo.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diffDays(target: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const t = new Date(target);
  t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - now.getTime()) / 86400000);
}

async function checkDeadlines(data: any) {
  if (!data) return;
  const today = todayKey();

  for (const area of data.areas || []) {
    const modulo = area.id === "lgpd" ? "LGPD" : "Compliance";
    for (const cliente of area.clientes || []) {
      for (const plano of cliente.planos || []) {
        for (const item of plano.items || []) {
          if (!item.prazo) continue;
          const prazoDate = parsePrazoBR(item.prazo);
          if (!prazoDate) continue;

          const diff = diffDays(prazoDate);
          if (diff > 3) continue;

          const key = `deadline_notif_${item.id}_${today}`;
          if (localStorage.getItem(key)) continue;

          const responsaveis: string[] = item.responsaveis || [];
          if (!responsaveis.length) continue;

          const trecho =
            diff < 0
              ? `Prazo vencido há ${Math.abs(diff)} dia${Math.abs(diff) !== 1 ? "s" : ""}`
              : diff === 0
              ? "Vencendo hoje"
              : `Vencendo em ${diff} dia${diff !== 1 ? "s" : ""}`;

          localStorage.setItem(key, "1");

          const rows = responsaveis.map((uid: string) => ({
            user_id: uid,
            tipo: "prazo",
            cliente_id: cliente.id,
            cliente_nome: cliente.name,
            modulo,
            plano_id: plano.id,
            plano_nome: plano.name,
            item_id: item.id,
            item_nome: item.name,
            trecho,
            autor_id: null,
            autor_nome: "sistema",
            lida: false,
          }));

          try {
            await supabase.from("notifications").insert(rows);
          } catch (e) {
            localStorage.removeItem(key);
            console.error("[useDeadlineCheck] falha ao inserir notificação de prazo", e);
          }
        }
      }
    }
  }
}

export function useDeadlineCheck(data: any) {
  useEffect(() => {
    checkDeadlines(data);
    const id = setInterval(() => checkDeadlines(data), 300_000);
    return () => clearInterval(id);
  }, [data]);
}
