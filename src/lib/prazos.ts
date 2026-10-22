// Avisos de prazo, calculados uma vez por dia no worker.
//
// Antes cada navegador aberto varria o escritório inteiro a cada cinco minutos
// e gravava avisos para os responsáveis de todos os cards, lembrando no
// localStorage o que já tinha avisado. Dois defeitos saíram disso, e o banco
// mostrava os dois: o mesmo aviso chegava uma vez por pessoa com o app aberto
// (178 repetidos), e card Finalizado ou Suspenso continuava sendo cobrado — 396
// dos 463 avisos de prazo eram de trabalho que já tinha acabado.
//
// Agora a conta é feita aqui, num lugar só, e o worker grava uma vez por dia.
// O que já foi avisado hoje vem do próprio banco, não do navegador de alguém.
//
// Fica sem imports com "@/" para rodar direto no node --test.

import { globalDeQualquerArea } from "./etapas.ts";
import type { DashboardState, Item } from "./dashboardTypes";

/** Quantos dias antes o aviso começa, quando o card não diz outra coisa. */
export const AVISO_PADRAO_DIAS = 3;

/** O fuso do escritório: "hoje" e "vence amanhã" são contados em Brasília. */
const FUSO = "America/Sao_Paulo";

export type AvisoPrazo = {
  user_id: string;
  tipo: "prazo";
  cliente_id: string;
  cliente_nome: string;
  modulo: string;
  plano_id: string;
  plano_nome: string;
  item_id: string;
  item_nome: string;
  trecho: string;
  autor_id: null;
  autor_nome: string;
  lida: false;
};

/** Data do calendário (AAAA-MM-DD) em que um instante cai, no fuso do escritório. */
export function diaNoEscritorio(instante: Date): string {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/**
 * O dia do prazo, como AAAA-MM-DD, e a hora quando foi escrita.
 *
 * O prazo é gravado de dois jeitos: "31/12/2026" ou "31/12/2026 14:30", vindo
 * das telas, e "2026-12-31" (às vezes com hora) vindo de importações. O dia é
 * lido como está escrito: "31/12" é 31/12 em Brasília, sem passar por UTC, que
 * em certas horas jogaria o prazo para o dia anterior.
 */
export function lerPrazo(prazo: unknown): { dia: string; hora: string | null } | null {
  const s = String(prazo ?? "").trim();
  if (!s) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (br) return { dia: `${br[3]}-${br[2]}-${br[1]}`, hora: br[4] ? `${br[4]}:${br[5]}` : null };
  // Com fuso ("...Z", "-03:00") é um instante, como o Trello exporta: o dia e a
  // hora são os de Brasília naquele instante.
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s) && !Number.isNaN(Date.parse(s))) {
    const instante = new Date(s);
    const hora = new Intl.DateTimeFormat("pt-BR", {
      timeZone: FUSO,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(instante);
    return { dia: diaNoEscritorio(instante), hora };
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if (iso) {
    return { dia: `${iso[1]}-${iso[2]}-${iso[3]}`, hora: iso[4] ? `${iso[4]}:${iso[5]}` : null };
  }
  return null;
}

/** Diferença em dias de calendário entre dois AAAA-MM-DD. */
function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);
}

/**
 * O card já não pede prazo: Finalizado, Suspenso ou uma etapa equivalente.
 *
 * "Indeferida" no INPI é processo encerrado mesmo sem dizer isso no nome, e os
 * status antigos de cinco valores ("Concluído", "Pausado") ainda aparecem em
 * cards que ninguém abriu desde a troca.
 */
export function prazoEncerrado(item: Item): boolean {
  const estado = String(item.kanbanStatus || item.status || "");
  if (estado === "Concluído" || estado === "Pausado") return true;
  const global = globalDeQualquerArea(estado);
  return global === "Finalizado" || global === "Suspenso";
}

/** Texto curto do aviso. */
export function textoDoAviso(dias: number, hora: string | null): string {
  if (dias < 0) return `Prazo vencido há ${-dias} dia${dias === -1 ? "" : "s"}`;
  if (dias === 0) return hora ? `Prazo hoje às ${hora}` : "Prazo hoje";
  return `Vencendo em ${dias} dia${dias === 1 ? "" : "s"}`;
}

/** Chave do que já foi avisado: a mesma pessoa, o mesmo card, o mesmo dia. */
export function chaveAviso(userId: string, itemId: string): string {
  return `${userId}|${itemId}`;
}

type Lugar = {
  cliente_id: string;
  cliente_nome: string;
  modulo: string;
  plano_id: string;
  plano_nome: string;
};

/**
 * Os avisos de prazo de hoje.
 *
 * `jaAvisados` traz as chaves (chaveAviso) dos avisos de prazo gravados hoje,
 * para que rodar duas vezes no mesmo dia não repita nada. `moduloDe` traduz o
 * id da área no rótulo das notificações; fica de fora para este arquivo não
 * depender do registro de áreas.
 */
export function avisosDePrazo(
  data: DashboardState | null | undefined,
  agora: Date,
  jaAvisados: Set<string>,
  moduloDe: (areaId: string) => string,
): AvisoPrazo[] {
  if (!data) return [];
  const hoje = diaNoEscritorio(agora);
  const avisos: AvisoPrazo[] = [];

  const avaliar = (item: Item, lugar: Lugar) => {
    if (!item?.id || prazoEncerrado(item)) return;
    const prazo = lerPrazo(item.prazo);
    if (!prazo) return;
    const dias = diasEntre(hoje, prazo.dia);
    const antecedencia = Number.isFinite(Number(item.avisoPrazoDias))
      ? Number(item.avisoPrazoDias)
      : AVISO_PADRAO_DIAS;
    if (dias > antecedencia) return;
    const responsaveis = Array.isArray(item.responsaveis) ? item.responsaveis : [];
    for (const uid of new Set(responsaveis.filter(Boolean))) {
      const chave = chaveAviso(uid, item.id);
      if (jaAvisados.has(chave)) continue;
      jaAvisados.add(chave);
      avisos.push({
        ...lugar,
        user_id: uid,
        tipo: "prazo",
        item_id: item.id,
        item_nome: item.name,
        trecho: textoDoAviso(dias, prazo.hora),
        autor_id: null,
        autor_nome: "sistema",
        lida: false,
      });
    }
  };

  for (const area of data.areas || []) {
    const modulo = moduloDe(area.id);
    for (const cliente of area.clientes || []) {
      for (const plano of cliente.planos || []) {
        for (const item of plano.items || []) {
          avaliar(item, {
            cliente_id: cliente.id,
            cliente_nome: cliente.name,
            modulo,
            plano_id: plano.id,
            plano_nome: plano.name,
          });
        }
      }
    }
  }
  // Produto guarda itens num nível só: faz papel de cliente e de plano.
  for (const produto of data.produtos || []) {
    for (const item of produto.items || []) {
      avaliar(item, {
        cliente_id: produto.id,
        cliente_nome: produto.name,
        modulo: "Produtos",
        plano_id: produto.id,
        plano_nome: produto.name,
      });
    }
  }
  return avisos;
}
