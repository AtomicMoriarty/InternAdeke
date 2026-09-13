import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { moduloOf } from "@/lib/areas";

function parsePrazo(prazo: string): Date | null {
  const br = prazo.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (br) {
    return new Date(
      Number(br[3]),
      Number(br[2]) - 1,
      Number(br[1]),
      Number(br[4] || 9),
      Number(br[5] || 0),
    );
  }
  const d = new Date(prazo);
  return Number.isNaN(d.getTime()) ? null : d;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diffDays(target: Date): number {
  const now = new Date();
  target = new Date(target);
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

async function checkDeadlines(data: any, currentUser: { id: string; email: string } | null) {
  if (!data) return;
  const today = todayKey();

  for (const area of data.areas || []) {
    const modulo = moduloOf(area.id);
    for (const cliente of area.clientes || []) {
      for (const plano of cliente.planos || []) {
        for (const item of plano.items || []) {
          if (!item.prazo) continue;
          const prazoDate = parsePrazo(item.prazo);
          if (!prazoDate) continue;

          const diff = diffDays(prazoDate);
          const alertDays = Number.isFinite(Number(item.avisoPrazoDias))
            ? Number(item.avisoPrazoDias)
            : 3;
          if (diff > alertDays) continue;

          const key = `deadline_notif_${item.id}_${item.prazo}_${alertDays}_${today}`;
          if (localStorage.getItem(key)) continue;

          const trecho =
            diff < 0
              ? `Prazo vencido há ${Math.abs(diff)} dias`
              : diff === 0
                ? `Deadline hoje às ${prazoDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
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
