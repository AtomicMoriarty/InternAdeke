// Cards que se repetem: relatório mensal de compliance, renovação de marca,
// reunião trimestral de governança.
//
// No Trello isso é o Card Repeater, que copia o card no dia marcado mas não
// mexe no prazo — a própria Atlassian manda montar uma automação à parte para
// corrigir a data. Aqui a regra é outra, pensada para escritório: o próximo
// card nasce quando o atual é finalizado, já com o prazo empurrado um período
// para a frente. Assim não se acumulam cópias de um trabalho que ninguém fez, e
// suspender o card (ou desligar a repetição) para a série.
//
// Roda no worker, na rotina diária. Rodar duas vezes não duplica: o card
// finalizado guarda o id do próximo em `recorrenciaProxima`.
//
// Fica sem imports com "@/" para rodar direto no node --test.

import { etapasDaArea, globalDeQualquerArea } from "./etapas.ts";
import { diaNoEscritorio, lerPrazo } from "./prazos.ts";
import type { DashboardState, Item } from "./dashboardTypes";

export const FREQUENCIAS = ["semanal", "mensal", "trimestral", "semestral", "anual"] as const;
export type Frequencia = (typeof FREQUENCIAS)[number];

export const ROTULO_FREQUENCIA: Record<Frequencia, string> = {
  semanal: "Toda semana",
  mensal: "Todo mês",
  trimestral: "A cada 3 meses",
  semestral: "A cada 6 meses",
  anual: "Todo ano",
};

/** O campo do card que liga a repetição. Ausente ou "" é card comum. */
export const CAMPO_RECORRENCIA = "recorrencia";

export function frequenciaDo(item: Item | null | undefined): Frequencia | null {
  const f = item?.[CAMPO_RECORRENCIA];
  return typeof f === "string" && (FREQUENCIAS as readonly string[]).includes(f)
    ? (f as Frequencia)
    : null;
}

/** Soma um período a um dia AAAA-MM-DD. Dia 31 num mês de 30 vira 30. */
export function somarPeriodo(dia: string, f: Frequencia): string {
  const [a, m, d] = dia.split("-").map(Number);
  if (f === "semanal") {
    const t = new Date(Date.UTC(a, m - 1, d + 7));
    return t.toISOString().slice(0, 10);
  }
  const meses = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 }[f];
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDoMes = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0),
  ).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDoMes));
  return alvo.toISOString().slice(0, 10);
}

function paraBR(dia: string, hora: string | null) {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}${hora ? ` ${hora}` : ""}`;
}

/**
 * O prazo do próximo card.
 *
 * Parte do prazo do card que acabou; sem prazo, parte do dia em que ele foi
 * finalizado. Se o resultado ainda cair no passado (o card ficou parado
 * meses), avança até a primeira data a partir de hoje: ninguém quer nascer
 * com três meses de atraso.
 */
export function proximoPrazo(prazo: unknown, f: Frequencia, hoje: string): string {
  const atual = lerPrazo(prazo);
  let dia = somarPeriodo(atual?.dia ?? hoje, f);
  for (let i = 0; dia < hoje && i < 1000; i++) dia = somarPeriodo(dia, f);
  return paraBR(dia, atual?.hora ?? null);
}

function finalizado(item: Item) {
  const estado = String(item.kanbanStatus || item.status || "");
  return estado === "Concluído" || globalDeQualquerArea(estado) === "Finalizado";
}

/** O estado em que o card novo nasce: o primeiro "A Fazer" da área. */
function estadoInicial(areaId: string) {
  return etapasDaArea(areaId).find((e) => e.equivale === "A Fazer")?.nome ?? "A Fazer";
}

/** O próximo card da série: o mesmo trabalho, zerado, com prazo novo. */
export function proximoCard(
  item: Item,
  areaId: string,
  f: Frequencia,
  agora: Date,
  novoId: () => string,
): Item {
  const hoje = diaNoEscritorio(agora);
  const quando = agora.toISOString();
  const id = novoId();
  const checklist = Array.isArray(item.checklist)
    ? item.checklist.map((c) => ({ ...c, id: novoId(), done: false }))
    : [];
  return {
    id,
    name: item.name,
    tipo: item.tipo,
    responsaveis: Array.isArray(item.responsaveis) ? [...item.responsaveis] : [],
    responsavel: item.responsavel,
    seguidores: Array.isArray(item.seguidores) ? [...item.seguidores] : undefined,
    etiquetas: Array.isArray(item.etiquetas) ? item.etiquetas.map((e) => ({ ...e })) : [],
    descricao: item.descricao,
    obs: "",
    checklist,
    avisoPrazoDias: item.avisoPrazoDias,
    acompanhamentoSemanal: item.acompanhamentoSemanal,
    templateId: item.templateId,
    status: "Não iniciado",
    kanbanStatus: estadoInicial(areaId),
    prazo: proximoPrazo(item.prazo, f, hoje),
    dataInicio: paraBR(hoje, null),
    criadoEm: quando,
    statusChangedAt: quando,
    [CAMPO_RECORRENCIA]: f,
    recorrenciaAnterior: item.id,
  };
}

export type ResultadoRecorrencia = { data: DashboardState; criados: number };

/**
 * Cria o próximo card de cada série cujo card atual foi finalizado.
 *
 * Devolve o mesmo objeto quando não há nada a fazer. O card novo entra logo
 * depois do finalizado, no mesmo plano.
 */
export function gerarRecorrencias(
  data: DashboardState,
  agora: Date,
  novoId: () => string = () => `it_${globalThis.crypto.randomUUID().slice(0, 12)}`,
): ResultadoRecorrencia {
  let criados = 0;

  const passarPelos = (items: Item[] | undefined, areaId: string): Item[] | undefined => {
    if (!Array.isArray(items)) return items;
    let mudou = false;
    const saida: Item[] = [];
    for (const item of items) {
      const f = frequenciaDo(item);
      if (f && finalizado(item) && !item.recorrenciaProxima) {
        const novo = proximoCard(item, areaId, f, agora, novoId);
        saida.push({ ...item, recorrenciaProxima: novo.id }, novo);
        criados++;
        mudou = true;
      } else {
        saida.push(item);
      }
    }
    return mudou ? saida : items;
  };

  const areas = data.areas?.map((area) => {
    const clientes = area.clientes?.map((cliente) => {
      const planos = cliente.planos?.map((plano) => {
        const items = passarPelos(plano.items, area.id);
        return items === plano.items ? plano : { ...plano, items };
      });
      return planos?.some((p, i) => p !== cliente.planos?.[i]) ? { ...cliente, planos } : cliente;
    });
    return clientes?.some((c, i) => c !== area.clientes?.[i]) ? { ...area, clientes } : area;
  });
  const produtos = data.produtos?.map((produto) => {
    const items = passarPelos(produto.items, "produtos");
    return items === produto.items ? produto : { ...produto, items };
  });

  if (!criados) return { data, criados: 0 };
  return { data: { ...data, areas, produtos }, criados };
}
