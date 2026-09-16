// Flattens dashboard_state into a flat list of cards for the Quadro Geral.

import { AREA_IDS, moduloOf } from "@/lib/areas";
import type { DashboardState, Item } from "@/lib/dashboardTypes";

export type FlatCard = {
  clienteId: string;
  clienteNome: string;
  areaId: string;
  modulo: string;
  planoId: string;
  planoNome: string;
  itemId: string;
  itemNome: string;
  legacyStatus: string;
  kanbanStatus: KanbanStatus;
  responsaveis: string[];
  /** Rótulos das etiquetas, para a busca do quadro achar por "URGENTE". */
  etiquetas: string[];
  notasCount: number;
  prazo: string; // ISO date or ""
  progresso: number; // 0-100
  subtotal: number;
  subdone: number;
  acompanhado: boolean; // acompanhamento semanal ligado neste card
};

export const KANBAN_COLUMNS = [
  "A Fazer",
  "Em Andamento",
  "Pendência Interna",
  "Pendência Cliente",
  "Monitoramento",
  "Finalizado",
  "Suspenso",
] as const;

export type KanbanStatus = (typeof KANBAN_COLUMNS)[number];

export const COLUMN_COLORS: Record<KanbanStatus, string> = {
  "A Fazer": "#64748B",
  "Em Andamento": "#3B82F6",
  "Pendência Interna": "#F59E0B",
  "Pendência Cliente": "#F97316",
  Monitoramento: "#06B6D4",
  Finalizado: "#10B981",
  Suspenso: "#94A3B8",
};

export const MODULO_COLOR: Record<string, string> = {
  LGPD: "#EF4444",
  Compliance: "#8B5CF6",
  Produtos: "#10B981",
  INPI: "#F59E0B",
  Societário: "#6366F1",
  Comercial: "#EC4899",
};

function rotulos(item: Item): string[] {
  return Array.isArray(item.etiquetas)
    ? item.etiquetas.map((e) => String((e as { label?: string })?.label || "")).filter(Boolean)
    : [];
}

function deriveKanbanStatus(item: Item): KanbanStatus {
  if (item.kanbanStatus && (KANBAN_COLUMNS as readonly string[]).includes(item.kanbanStatus)) {
    return item.kanbanStatus as KanbanStatus;
  }
  const s = String(item.status || "");
  if ((KANBAN_COLUMNS as readonly string[]).includes(s)) return s as KanbanStatus;
  if (s === "Concluído") return "Finalizado";
  if (s === "Em andamento") return "Em Andamento";
  if (s === "Pausado") return "Suspenso";
  return "A Fazer";
}

export function flattenDashboard(data: DashboardState | null): FlatCard[] {
  if (!data?.areas) return [];
  const cards: FlatCard[] = [];
  for (const area of data.areas) {
    if (!AREA_IDS.includes(area.id)) continue;
    const modulo = moduloOf(area.id);
    for (const cliente of area.clientes || []) {
      for (const plano of cliente.planos || []) {
        for (const item of plano.items || []) {
          const subs = Array.isArray(item.subitens) ? item.subitens : [];
          const subdone = subs.filter(
            (s: { done?: boolean; concluido?: boolean }) => s.done || s.concluido,
          ).length;
          const progresso =
            typeof item.progresso === "number"
              ? item.progresso
              : subs.length
                ? Math.round((subdone / subs.length) * 100)
                : item.status === "Concluído"
                  ? 100
                  : 0;
          cards.push({
            clienteId: cliente.id,
            clienteNome: cliente.name,
            areaId: area.id,
            modulo,
            planoId: plano.id,
            planoNome: plano.name,
            itemId: item.id,
            itemNome: item.name,
            legacyStatus: item.status || "",
            kanbanStatus: deriveKanbanStatus(item),
            responsaveis: Array.isArray(item.responsaveis) ? item.responsaveis : [],
            etiquetas: rotulos(item),
            notasCount: Array.isArray(item.notas) ? item.notas.length : 0,
            prazo: item.prazo || "",
            progresso,
            subtotal: subs.length,
            subdone,
            acompanhado: item.acompanhamentoSemanal === true,
          });
        }
      }
    }
  }
  for (const produto of data.produtos || []) {
    for (const item of produto.items || []) {
      const subs = Array.isArray(item.subitens) ? item.subitens : [];
      const subdone = subs.filter(
        (s: { done?: boolean; concluido?: boolean }) => s.done || s.concluido,
      ).length;
      const progresso =
        typeof item.progresso === "number"
          ? item.progresso
          : subs.length
            ? Math.round((subdone / subs.length) * 100)
            : deriveKanbanStatus(item) === "Finalizado"
              ? 100
              : 0;
      cards.push({
        clienteId: produto.id,
        clienteNome: produto.name,
        areaId: "produtos",
        modulo: "Produtos",
        planoId: produto.id,
        planoNome: produto.name,
        itemId: item.id,
        itemNome: item.name,
        legacyStatus: item.status || "",
        kanbanStatus: deriveKanbanStatus(item),
        responsaveis: Array.isArray(item.responsaveis) ? item.responsaveis : [],
        etiquetas: rotulos(item),
        notasCount: Array.isArray(item.notas) ? item.notas.length : 0,
        prazo: item.prazo || "",
        progresso,
        subtotal: subs.length,
        subdone,
        acompanhado: item.acompanhamentoSemanal === true,
      });
    }
  }
  return cards;
}

/** Grava o status registrando quando mudou, base do relatorio de tempo por etapa. */
function carimbarStatus(it: Item, newStatus: KanbanStatus): Item {
  const agora = new Date().toISOString();
  return {
    ...it,
    status: newStatus,
    kanbanStatus: newStatus,
    statusChangedAt: agora,
    statusHistory: [
      ...(Array.isArray(it.statusHistory) ? it.statusHistory : []),
      { de: it.kanbanStatus || deriveKanbanStatus(it), para: newStatus, em: agora },
    ].slice(-50),
  };
}

export function setItemKanbanStatus(
  data: DashboardState,
  card: FlatCard,
  newStatus: KanbanStatus,
): DashboardState {
  return {
    ...data,
    areas: (data.areas || []).map((a) => {
      if (a.id !== card.areaId) return a;
      return {
        ...a,
        clientes: (a.clientes || []).map((c) => {
          if (c.id !== card.clienteId) return c;
          return {
            ...c,
            planos: (c.planos || []).map((p) => {
              if (p.id !== card.planoId) return p;
              return {
                ...p,
                items: (p.items || []).map((it) =>
                  it.id !== card.itemId ? it : carimbarStatus(it, newStatus),
                ),
              };
            }),
          };
        }),
      };
    }),
    produtos: (data.produtos || []).map((p) =>
      card.areaId !== "produtos" || p.id !== card.clienteId
        ? p
        : {
            ...p,
            items: (p.items || []).map((it) =>
              it.id !== card.itemId ? it : carimbarStatus(it, newStatus),
            ),
          },
    ),
  };
}
