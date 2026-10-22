// A triagem agrupada: por cliente ou por responsável, em vez de uma lista de
// demandas.
//
// A lista solta tinha mais de cem linhas, e a decisão quase nunca é por
// demanda: "tudo da Acme fica com a Ana", "o que a Ana tem precisa de prazo".
// Agrupando, são algumas dezenas de linhas, e cada uma resolve várias de uma
// vez.
//
// Fica sem imports com "@/" para rodar direto no node --test.

import { semAcento } from "./comum.ts";

/** O pedaço do FlatCard que a triagem usa. */
export type CardTriagem = {
  itemId: string;
  itemNome: string;
  clienteId: string;
  clienteNome: string;
  areaId: string;
  responsaveis: string[];
  prazo: string;
};

export type Filtro = "semDono" | "semPrazo" | "todos";

export type Problemas = { semDono: boolean; semPrazo: boolean };

/**
 * O que falta neste card. "Sem dono" inclui o card que só está na conta do
 * escritório: ninguém de verdade vai cobrá-lo.
 */
export function problemasDo(c: CardTriagem, idDoEscritorio = ""): Problemas {
  const pessoas = (c.responsaveis || []).filter((id) => id && id !== idDoEscritorio);
  return { semDono: pessoas.length === 0, semPrazo: !c.prazo };
}

export function passaNoFiltro(c: CardTriagem, f: Filtro, idDoEscritorio = ""): boolean {
  const p = problemasDo(c, idDoEscritorio);
  if (f === "semDono") return p.semDono;
  if (f === "semPrazo") return p.semPrazo;
  return p.semDono || p.semPrazo;
}

export type Grupo<T extends CardTriagem> = {
  chave: string;
  nome: string;
  cards: T[];
  semDono: number;
  semPrazo: number;
  /** Áreas em que o grupo aparece, na ordem em que surgem. */
  areas: string[];
};

function novoGrupo<T extends CardTriagem>(chave: string, nome: string): Grupo<T> {
  return { chave, nome, cards: [], semDono: 0, semPrazo: 0, areas: [] };
}

function somar<T extends CardTriagem>(g: Grupo<T>, c: T, idDoEscritorio: string) {
  const p = problemasDo(c, idDoEscritorio);
  g.cards.push(c);
  if (p.semDono) g.semDono++;
  if (p.semPrazo) g.semPrazo++;
  if (!g.areas.includes(c.areaId)) g.areas.push(c.areaId);
}

const porPendencia = <T extends CardTriagem>(a: Grupo<T>, b: Grupo<T>) =>
  b.semDono + b.semPrazo - (a.semDono + a.semPrazo) || a.nome.localeCompare(b.nome);

/**
 * Um grupo por cliente. O mesmo cliente em duas áreas é um grupo só (pelo
 * nome, como no Quadro Geral): a decisão é sobre a empresa, não sobre a área.
 */
export function porCliente<T extends CardTriagem>(cards: T[], idDoEscritorio = ""): Grupo<T>[] {
  const grupos = new Map<string, Grupo<T>>();
  for (const c of cards) {
    const chave = semAcento(c.clienteNome) || c.clienteId;
    const g = grupos.get(chave) || novoGrupo<T>(chave, c.clienteNome);
    somar(g, c, idDoEscritorio);
    grupos.set(chave, g);
  }
  return [...grupos.values()].sort(porPendencia);
}

/** Chave do grupo dos cards sem ninguém (ou só com a conta do escritório). */
export const SEM_RESPONSAVEL = "";

/**
 * Um grupo por pessoa; o card com duas pessoas aparece nas duas. Os sem
 * responsável formam o primeiro grupo, porque são os que ninguém vai ver.
 */
export function porResponsavel<T extends CardTriagem>(
  cards: T[],
  nomeDe: (id: string) => string,
  idDoEscritorio = "",
): Grupo<T>[] {
  const grupos = new Map<string, Grupo<T>>();
  for (const c of cards) {
    const pessoas = (c.responsaveis || []).filter((id) => id && id !== idDoEscritorio);
    for (const id of pessoas.length ? pessoas : [SEM_RESPONSAVEL]) {
      const g =
        grupos.get(id) || novoGrupo<T>(id, id === SEM_RESPONSAVEL ? "Sem responsável" : nomeDe(id));
      somar(g, c, idDoEscritorio);
      grupos.set(id, g);
    }
  }
  const sem = grupos.get(SEM_RESPONSAVEL);
  grupos.delete(SEM_RESPONSAVEL);
  return [...(sem ? [sem] : []), ...[...grupos.values()].sort(porPendencia)];
}

/** "2026-10-31" (campo de data) → "31/10/2026" (como o estado guarda). */
export function isoParaBR(iso: string): string {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
