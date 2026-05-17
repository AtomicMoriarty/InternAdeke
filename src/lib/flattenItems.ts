// Flattens dashboard_state into a flat list of cards for the Quadro Geral.

export type FlatCard = {
  clienteId: string;
  clienteNome: string;
  areaId: string;            // "lgpd" | "compliance"
  modulo: "LGPD" | "Compliance";
  planoId: string;
  planoNome: string;
  itemId: string;
  itemNome: string;
  legacyStatus: string;
  kanbanStatus: KanbanStatus;
  responsaveis: string[];
  notasCount: number;
  prazo: string;             // ISO date or ""
  progresso: number;         // 0-100
  subtotal: number;
  subdone: number;
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

export type KanbanStatus = typeof KANBAN_COLUMNS[number];

export const COLUMN_COLORS: Record<KanbanStatus, string> = {
  "A Fazer": "#64748B",
  "Em Andamento": "#3B82F6",
  "Pendência Interna": "#F59E0B",
  "Pendência Cliente": "#F97316",
  "Monitoramento": "#06B6D4",
  "Finalizado": "#10B981",
  "Suspenso": "#94A3B8",
};

export const MODULO_COLOR: Record<"LGPD" | "Compliance", string> = {
  LGPD: "#EF4444",
  Compliance: "#8B5CF6",
};

function deriveKanbanStatus(item: any): KanbanStatus {
  if (item.kanbanStatus && (KANBAN_COLUMNS as readonly string[]).includes(item.kanbanStatus)) {
    return item.kanbanStatus as KanbanStatus;
  }
  const s = item.status;
  if (s === "Concluído") return "Finalizado";
  if (s === "Em andamento") return "Em Andamento";
  if (s === "Pausado") return "Suspenso";
  return "A Fazer";
}

export function flattenDashboard(data: any): FlatCard[] {
  if (!data?.areas) return [];
  const cards: FlatCard[] = [];
  for (const area of data.areas) {
    if (area.id !== "lgpd" && area.id !== "compliance") continue;
    const modulo: "LGPD" | "Compliance" = area.id === "lgpd" ? "LGPD" : "Compliance";
    for (const cliente of area.clientes || []) {
      for (const plano of cliente.planos || []) {
        for (const item of plano.items || []) {
          const subs = Array.isArray(item.subitens) ? item.subitens : [];
          const subdone = subs.filter((s: any) => s.done || s.concluido).length;
          const progresso = typeof item.progresso === "number"
            ? item.progresso
            : subs.length ? Math.round((subdone / subs.length) * 100)
            : (item.status === "Concluído" ? 100 : 0);
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
            notasCount: Array.isArray(plano.notas) ? plano.notas.length : 0,
            prazo: item.prazo || "",
            progresso,
            subtotal: subs.length,
            subdone,
          });
        }
      }
    }
  }
  return cards;
}

export function setItemKanbanStatus(data: any, card: FlatCard, newStatus: KanbanStatus): any {
  return {
    ...data,
    areas: (data.areas || []).map((a: any) => {
      if (a.id !== card.areaId) return a;
      return {
        ...a,
        clientes: a.clientes.map((c: any) => {
          if (c.id !== card.clienteId) return c;
          return {
            ...c,
            planos: c.planos.map((p: any) => {
              if (p.id !== card.planoId) return p;
              return {
                ...p,
                items: p.items.map((it: any) =>
                  it.id !== card.itemId ? it : { ...it, kanbanStatus: newStatus }
                ),
              };
            }),
          };
        }),
      };
    }),
  };
}
