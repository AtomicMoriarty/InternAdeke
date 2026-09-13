// Templates de card.
//
// Um template guarda tudo que se repete ao abrir uma demanda: tipo, quem
// costuma tocar, prazo típico, checklist e etiquetas. Um clique cria o card
// pronto, em vez de preencher campo a campo.
//
// Ficam no dashboard_state, não no código: o escritório ajusta conforme a
// prática muda, sem depender de uma publicação.

import { AREAS, DEMANDAS_POR_AREA, checklistTemplateFor } from "@/lib/areas";
import type { DashboardState, Item } from "@/lib/dashboardTypes";

export type ItemChecklistTemplate = { text: string };

export type TemplateCard = {
  id: string;
  nome: string;
  /** Quadro a que pertence. Vazio = vale em todos. */
  areaId: string;
  tipo: string;
  /** Responsáveis que já entram no card. */
  responsaveis: string[];
  /** Prazo relativo à criação, em dias. null = sem prazo automático. */
  prazoDias: number | null;
  checklist: string[];
  etiquetas: { label: string; color: string }[];
  acompanhamentoSemanal: boolean;
  descricao: string;
};

export const TIPOS_PADRAO = [
  "Organograma",
  "Política",
  "Procedimento",
  "Processo",
  "Treinamento",
  "Relatório",
  "Auditoria",
  "Documento",
  "Petição",
  "Contrato",
  "Outro",
];

function uid() {
  return `_${Math.random().toString(36).slice(2, 9)}`;
}

export function templateVazio(areaId = ""): TemplateCard {
  return {
    id: `tpl${uid()}`,
    nome: "",
    areaId,
    tipo: "Documento",
    responsaveis: [],
    prazoDias: null,
    checklist: [],
    etiquetas: [],
    acompanhamentoSemanal: false,
    descricao: "",
  };
}

/**
 * Templates iniciais, derivados das demandas que já existiam no código.
 * Servem de ponto de partida; a partir daí quem manda é o que está no banco.
 */
export function templatesIniciais(): TemplateCard[] {
  const out: TemplateCard[] = [];
  for (const area of AREAS) {
    for (const demanda of DEMANDAS_POR_AREA[area.id] || []) {
      out.push({
        ...templateVazio(area.id),
        id: `tpl_${area.id}_${demanda
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "")}`,
        nome: demanda,
        checklist: checklistTemplateFor(demanda),
      });
    }
  }
  return out;
}

/**
 * Garante que o estado tenha a lista de templates.
 *
 * Só semeia quando o campo não existe. Depois disso o banco é a verdade — se
 * alguém apagar um template, ele não volta na próxima abertura.
 */
export function ensureTemplates(data: DashboardState): DashboardState {
  if (!data) return data;
  if (Array.isArray(data.templates)) return data;
  return { ...data, templates: templatesIniciais() };
}

/** Templates que valem num quadro: os dele mais os globais. */
export function templatesDaArea(data: DashboardState | null, areaId: string): TemplateCard[] {
  const todos: TemplateCard[] = Array.isArray(data?.templates)
    ? (data.templates as TemplateCard[])
    : [];
  return todos
    .filter((t) => !t.areaId || t.areaId === areaId)
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

function dataBR(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export type ContextoCriacao = {
  /** Quem está criando; entra como responsável junto com os do template. */
  criadorId: string | null;
  agora?: Date;
};

/**
 * Monta o item a partir do template.
 *
 * O criador entra como responsável junto com os do template, sem duplicar — a
 * automação de "quem cria é responsável" continua valendo mesmo quando o
 * template já traz gente.
 */
export function aplicarTemplate(tpl: TemplateCard, ctx: ContextoCriacao): Item {
  const agora = ctx.agora || new Date();
  const iso = agora.toISOString();

  const responsaveis = [
    ...new Set([...(tpl.responsaveis || []), ...(ctx.criadorId ? [ctx.criadorId] : [])]),
  ];

  let prazo = "";
  if (typeof tpl.prazoDias === "number" && tpl.prazoDias >= 0) {
    const d = new Date(agora);
    d.setDate(d.getDate() + tpl.prazoDias);
    prazo = dataBR(d);
  }

  return {
    id: `it${uid()}`,
    name: tpl.nome,
    tipo: tpl.tipo || "Documento",
    responsavel: "",
    responsaveis,
    status: "Não iniciado",
    kanbanStatus: "A Fazer",
    obs: "",
    descricao: tpl.descricao || "",
    prazo,
    dataInicio: dataBR(agora),
    criadoEm: iso,
    statusChangedAt: iso,
    checklist: (tpl.checklist || [])
      .filter((t) => t && t.trim())
      .map((t) => ({ id: `ck${uid()}`, text: t.trim(), done: false })),
    etiquetas: (tpl.etiquetas || []).map((e) => ({
      id: `et${uid()}`,
      label: e.label,
      color: e.color,
    })),
    ...(tpl.acompanhamentoSemanal ? { acompanhamentoSemanal: true } : {}),
    templateId: tpl.id,
  };
}

/** Resumo curto do que o template preenche, para a tela de escolha. */
export function resumirTemplate(tpl: TemplateCard): string {
  const partes: string[] = [];
  if (tpl.tipo) partes.push(tpl.tipo);
  if (tpl.checklist?.length) partes.push(`${tpl.checklist.length} etapas`);
  if (typeof tpl.prazoDias === "number") {
    partes.push(tpl.prazoDias === 0 ? "prazo hoje" : `prazo +${tpl.prazoDias}d`);
  }
  if (tpl.responsaveis?.length) partes.push(`${tpl.responsaveis.length} resp.`);
  if (tpl.acompanhamentoSemanal) partes.push("semanal");
  return partes.join(" · ");
}

/** Grava a lista de templates no estado. */
export function salvarTemplates(data: DashboardState, templates: TemplateCard[]): DashboardState {
  return { ...data, templates };
}
