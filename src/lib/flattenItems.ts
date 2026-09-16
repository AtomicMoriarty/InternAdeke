// Flattens dashboard_state into a flat list of cards for the Quadro Geral.

import { AREA_IDS, moduloOf } from "@/lib/areas";
// As sete colunas moram em etapas.ts, junto das etapas por área: elas são o
// caso base, e mantê-las lá evita que os dois arquivos se importem em ciclo.
import {
  KANBAN_COLUMNS,
  COLUMN_COLORS,
  equivalenteGlobal,
  etapaDoItem,
  statusLegado,
  type KanbanStatus,
} from "@/lib/etapas";

export { KANBAN_COLUMNS, COLUMN_COLORS };
export type { KanbanStatus };
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
  /**
   * A etapa do card no quadro da própria área.
   *
   * Igual a kanbanStatus onde a área usa as sete colunas; no INPI é a etapa
   * do processo, e kanbanStatus guarda o equivalente global.
   */
  etapa: string;
  /** Rótulos das etiquetas, para a busca do quadro achar por "URGENTE". */
  etiquetas: string[];
  notasCount: number;
  prazo: string; // ISO date or ""
  progresso: number; // 0-100
  subtotal: number;
  subdone: number;
  acompanhado: boolean; // acompanhamento semanal ligado neste card
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

/**
 * O estado do card nas sete colunas globais.
 *
 * Recebe a área porque o INPI guarda a etapa do processo em kanbanStatus —
 * "Exame de mérito", "Prazo recursal" — e para o Quadro Geral, a tela "Eu" e
 * os relatórios isso tem que virar Monitoramento ou Pendência Interna. Sem a
 * área, um card do INPI cairia em "A Fazer" e mentiria em toda tela que
 * atravessa áreas.
 */
function deriveKanbanStatus(item: Item, areaId = ""): KanbanStatus {
  if (item.kanbanStatus && (KANBAN_COLUMNS as readonly string[]).includes(item.kanbanStatus)) {
    return item.kanbanStatus as KanbanStatus;
  }
  const daArea = equivalenteGlobal(areaId, item.kanbanStatus as string);
  if (daArea) return daArea;
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
            kanbanStatus: deriveKanbanStatus(item, area.id),
            responsaveis: Array.isArray(item.responsaveis) ? item.responsaveis : [],
            etapa: etapaDoItem(item, area.id),
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
        etapa: deriveKanbanStatus(item),
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
/**
 * Grava o novo estado no card.
 *
 * kanbanStatus guarda o que a área usa — uma das sete colunas, ou a etapa do
 * INPI. O campo status, de cinco valores, é o formato antigo que algumas telas
 * ainda leem, e recebe sempre o equivalente global: "Exame de mérito" não
 * significa nada para quem lê status.
 */
function carimbarStatus(it: Item, newStatus: string, areaId = ""): Item {
  const agora = new Date().toISOString();
  const global = equivalenteGlobal(areaId, newStatus) || "Em Andamento";
  return {
    ...it,
    status: statusLegado(global),
    kanbanStatus: newStatus,
    statusChangedAt: agora,
    statusHistory: [
      ...(Array.isArray(it.statusHistory) ? it.statusHistory : []),
      { de: it.kanbanStatus || deriveKanbanStatus(it, areaId), para: newStatus, em: agora },
    ].slice(-50),
  };
}

export function setItemKanbanStatus(
  data: DashboardState,
  card: FlatCard,
  newStatus: string,
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
                  it.id !== card.itemId ? it : carimbarStatus(it, newStatus, card.areaId),
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
