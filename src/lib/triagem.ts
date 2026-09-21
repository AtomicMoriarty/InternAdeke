// O que está no sistema mas ainda não é trabalho de ninguém.
//
// A importação do Trello trouxe 487 cards de uma vez. Quase 350 são histórico
// — processos que já acabaram — e não precisam de nada. Mas entre os que
// continuam abertos há um grupo grande que o sistema não consegue cobrar:
// card sem responsável não aparece no "Eu" de ninguém, e card sem prazo não
// entra em nenhum alerta, relatório de atraso ou linha do tempo.
//
// Eles não estão perdidos: estão à vista no quadro. O que falta é alguém
// passar por eles uma vez e dizer de quem são e para quando. Este arquivo
// acha esses cards; a tela de Triagem é onde essa passada acontece.

import type { DashboardState } from "@/lib/dashboardTypes";
import { flattenDashboard, type FlatCard } from "@/lib/flattenItems";
import { globalDeQualquerArea } from "@/lib/etapas";

/**
 * Um card encerrado não precisa de dono nem de prazo.
 *
 * Vale tanto "Finalizado" quanto as etapas que equivalem a ele — "Indeferida"
 * no INPI é um processo que acabou, mesmo o nome não dizendo isso.
 */
export function estaEncerrado(card: FlatCard): boolean {
  return globalDeQualquerArea(card.etapa || card.kanbanStatus) === "Finalizado";
}

/** Suspenso é decisão consciente: não está esquecido, está parado de propósito. */
export function estaSuspenso(card: FlatCard): boolean {
  return globalDeQualquerArea(card.etapa || card.kanbanStatus) === "Suspenso";
}

export function cardsEmAberto(data: DashboardState | null): FlatCard[] {
  return flattenDashboard(data).filter((c) => !estaEncerrado(c));
}

export type Pendencias = {
  /** Abertos, fora os suspensos: é o trabalho que corre agora. */
  ativos: FlatCard[];
  semDono: FlatCard[];
  semPrazo: FlatCard[];
  /** Estão com a conta do escritório, isto é, com ninguém de verdade. */
  noEscritorio: FlatCard[];
  suspensos: FlatCard[];
};

/**
 * O que precisa de uma decisão humana.
 *
 * Os suspensos ficam de fora de "sem dono" e "sem prazo" de propósito: cobrar
 * prazo de algo que o cliente mandou parar seria ruído, e ruído faz a lista
 * inteira ser ignorada.
 */
export function pendencias(data: DashboardState | null, idDoEscritorio?: string): Pendencias {
  const abertos = cardsEmAberto(data);
  const suspensos = abertos.filter(estaSuspenso);
  const ativos = abertos.filter((c) => !estaSuspenso(c));
  return {
    ativos,
    suspensos,
    semDono: ativos.filter((c) => !c.responsaveis?.length),
    semPrazo: ativos.filter((c) => !c.prazo),
    noEscritorio: idDoEscritorio
      ? ativos.filter((c) => c.responsaveis?.length === 1 && c.responsaveis[0] === idDoEscritorio)
      : [],
  };
}

export type CargaDaPessoa = { id: string; ativos: number; semPrazo: number };

/**
 * Quantos cards ativos cada pessoa carrega.
 *
 * Serve para a triagem não piorar o desequilíbrio: distribuir os sem dono é
 * justamente o momento em que dá para ver que uma pessoa tem sessenta e outra
 * tem duas.
 */
export function cargaPorPessoa(data: DashboardState | null): CargaDaPessoa[] {
  const conta = new Map<string, CargaDaPessoa>();
  for (const c of cardsEmAberto(data)) {
    if (estaSuspenso(c)) continue;
    for (const id of c.responsaveis || []) {
      const atual = conta.get(id) || { id, ativos: 0, semPrazo: 0 };
      atual.ativos++;
      if (!c.prazo) atual.semPrazo++;
      conta.set(id, atual);
    }
  }
  return [...conta.values()].sort((a, b) => b.ativos - a.ativos);
}

/** Uma linha por área, para saber onde a triagem dá mais trabalho. */
export function pendenciasPorArea(
  p: Pendencias,
): { areaId: string; semDono: number; semPrazo: number }[] {
  const mapa = new Map<string, { areaId: string; semDono: number; semPrazo: number }>();
  const pega = (areaId: string) => {
    const a = mapa.get(areaId) || { areaId, semDono: 0, semPrazo: 0 };
    mapa.set(areaId, a);
    return a;
  };
  for (const c of p.semDono) pega(c.areaId).semDono++;
  for (const c of p.semPrazo) pega(c.areaId).semPrazo++;
  return [...mapa.values()].sort((a, b) => b.semDono + b.semPrazo - (a.semDono + a.semPrazo));
}
