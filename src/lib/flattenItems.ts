// Flattens dashboard_state into a flat list of cards for the Quadro Geral.

import {
  AREA_IDS, moduloOf, MODULO_PRODUTOS,
  MODULO_COLOR as AREA_MODULO_COLOR,
} from "@/lib/areas";

/** id sintetico da "area" de produtos, que na verdade e data.produtos */
export const PRODUTOS_AREA_ID = "produtos";

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
  notasCount: number;
  prazo: string;             // ISO date or ""
  dataInicio: string;        // DD/MM/AAAA ou ""
  diasNoStatus: number | null; // dias desde a última mudança de status
  progresso: number;         // 0-100
  subtotal: number;
  subdone: number;
};

// Dias desde um timestamp ISO. null quando não há registro.
export function diasDesde(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (isNaN(t.getTime())) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  t.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((now.getTime() - t.getTime()) / 86400000));
}

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

export const MODULO_COLOR: Record<string, string> = AREA_MODULO_COLOR;

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
    if (!AREA_IDS.includes(area.id)) continue;
    const modulo = moduloOf(area.id);
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
            dataInicio: item.dataInicio || "",
            diasNoStatus: diasDesde(item.statusChangedAt),
            progresso,
            subtotal: subs.length,
            subdone,
          });
        }
      }
    }
  }

  // Produtos moram em data.produtos, fora de data.areas, mas aparecem no
  // Quadro Geral como um modulo proprio. Cada produto funciona como cliente e
  // como plano ao mesmo tempo, ja que seus itens ficam num nivel so.
  for (const prod of data.produtos || []) {
    for (const item of prod.items || []) {
      const subs = Array.isArray(item.subitens) ? item.subitens : [];
      const subdone = subs.filter((s: any) => s.done || s.concluido).length;
      const progresso = typeof item.progresso === "number"
        ? item.progresso
        : subs.length ? Math.round((subdone / subs.length) * 100)
        : (deriveKanbanStatus(item) === "Finalizado" ? 100 : 0);
      cards.push({
        clienteId: prod.id,
        clienteNome: prod.name,
        areaId: PRODUTOS_AREA_ID,
        modulo: MODULO_PRODUTOS,
        planoId: prod.id,
        planoNome: prod.name,
        itemId: item.id,
        itemNome: item.name,
        legacyStatus: item.status || "",
        kanbanStatus: deriveKanbanStatus(item),
        responsaveis: Array.isArray(item.responsaveis) ? item.responsaveis : [],
        notasCount: Array.isArray(prod.notas) ? prod.notas.length : 0,
        prazo: item.prazo || "",
        dataInicio: item.dataInicio || "",
        diasNoStatus: diasDesde(item.statusChangedAt),
        progresso,
        subtotal: subs.length,
        subdone,
      });
    }
  }

  return cards;
}

/** Aplica a mudanca de status carimbando o momento e registrando a transicao. */
function aplicarStatus(it: any, newStatus: KanbanStatus) {
  const agora = new Date().toISOString();
  return {
    ...it,
    kanbanStatus: newStatus,
    statusChangedAt: agora,
    statusHistory: [
      ...(Array.isArray(it.statusHistory) ? it.statusHistory : []),
      { de: it.kanbanStatus || deriveKanbanStatus(it), para: newStatus, em: agora },
    ].slice(-50),
  };
}

export function setItemKanbanStatus(data: any, card: FlatCard, newStatus: KanbanStatus): any {
  // Cards de produto vivem em data.produtos, com um nivel a menos de aninhamento
  if (card.areaId === PRODUTOS_AREA_ID) {
    return {
      ...data,
      produtos: (data.produtos || []).map((p: any) =>
        p.id !== card.clienteId ? p : {
          ...p,
          items: (p.items || []).map((it: any) =>
            it.id !== card.itemId ? it : aplicarStatus(it, newStatus)
          ),
        }
      ),
    };
  }

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
                  it.id !== card.itemId ? it : aplicarStatus(it, newStatus)
                ),
              };
            }),
          };
        }),
      };
    }),
  };
}
