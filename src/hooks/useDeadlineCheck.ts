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
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

async function checkDeadlines(data: any, currentUser: { id: string; email: string } | null) {
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

          const trecho =
            diff < 0
              ? `Prazo vencido há ${Math.abs(diff)} dias`
              : diff === 0
              ? "Vencendo hoje"
              : `Vencendo em ${diff} dia${diff !== 1 ? "s" : ""}`;

          const responsaveis: string[] = item.responsaveis || [];
          if (!responsaveis.length) continue;

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

          await supabase.from("notifications").insert(rows);
        }
      }
    }
  }
}

export function useDeadlineCheck(data: any, currentUser: { id: string; email: string } | null) {
  useEffect(() => {
    checkDeadlines(data, currentUser);
    const id = setInterval(() => checkDeadlines(data, currentUser), 300_000);
    return () => clearInterval(id);
  }, [data, currentUser]);
}
