// Acompanhamento semanal automático.
//
// Roda no worker, por Cron Trigger, sem depender de alguém ter o app aberto.
// Para cada item em aberto das áreas configuradas, posta um comentário com a
// situação da semana: status, há quanto tempo está parado e como anda o prazo.
//
// Pensado para o controle do INPI, onde o valor está em ter registro semanal
// mesmo quando nada mudou — é justamente o "nada mudou há 3 semanas" que
// precisa saltar aos olhos.

import { AREA_IDS } from "@/lib/areas";

/** Áreas que recebem o acompanhamento. Vazio desliga a automação. */
export const AREAS_COM_ACOMPANHAMENTO = AREA_IDS;

/**
 * Quantos acompanhamentos manter por item.
 *
 * Sem teto isto cresce para sempre: 25 itens semanais dão ~1.300 comentários e
 * 250 KB por ano, num JSON que é carregado inteiro a cada abertura do app — e
 * piora conforme entram clientes. Oito semanas bastam para enxergar "parado há
 * um mês" sem pesar. Comentários escritos por pessoas nunca são removidos.
 */
export const MAX_ACOMPANHAMENTOS_POR_ITEM = 8;

const DIA_MS = 86400000;

function parseBR(s?: string | null): Date | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

function diasEntre(a: Date, b: Date): number {
  const x = new Date(a); x.setHours(0, 0, 0, 0);
  const y = new Date(b); y.setHours(0, 0, 0, 0);
  return Math.round((y.getTime() - x.getTime()) / DIA_MS);
}

function uid() {
  return `_${Math.random().toString(36).slice(2, 9)}`;
}

function dataBR(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Segunda-feira da semana de `d`, usada como chave para não repetir o post. */
export function chaveDaSemana(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const diaDaSemana = (x.getDay() + 6) % 7; // 0 = segunda
  x.setDate(x.getDate() - diaDaSemana);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function statusDoItem(item: any): string {
  return item?.kanbanStatus || item?.status || "A Fazer";
}

/** Monta o texto do acompanhamento. Devolve null quando não há o que dizer. */
export function textoAcompanhamento(item: any, agora: Date): string | null {
  const status = statusDoItem(item);
  if (status === "Finalizado") return null;

  const partes = [`Status: ${status}`];

  const desde = item.statusChangedAt || item.criadoEm;
  if (desde) {
    const d = new Date(desde);
    if (!isNaN(d.getTime())) {
      const dias = Math.max(0, diasEntre(d, agora));
      partes.push(
        dias === 0 ? "mudou hoje"
        : dias === 1 ? "há 1 dia nesta etapa"
        : `há ${dias} dias nesta etapa`,
      );
    }
  }

  const prazo = parseBR(item.prazo);
  if (prazo) {
    const dias = diasEntre(agora, prazo);
    partes.push(
      dias < 0 ? `prazo vencido há ${Math.abs(dias)} dia${Math.abs(dias) !== 1 ? "s" : ""}`
      : dias === 0 ? "prazo vence hoje"
      : `prazo em ${dias} dia${dias !== 1 ? "s" : ""}`,
    );
  }

  const checklist = Array.isArray(item.checklist) ? item.checklist : [];
  if (checklist.length) {
    partes.push(`checklist ${checklist.filter((c: any) => c.done).length}/${checklist.length}`);
  }

  return `Acompanhamento semanal — ${partes.join(" · ")}`;
}

/** Já existe acompanhamento desta semana neste item? */
function jaTemDaSemana(item: any, semana: string): boolean {
  return (item.comentarios || []).some((c: any) => c?.semanaAcompanhamento === semana);
}

/**
 * Mantem so os acompanhamentos mais recentes, preservando a ordem original e
 * todos os comentarios escritos por pessoas.
 */
export function podarAcompanhamentos(
  comentarios: any[],
  max: number = MAX_ACOMPANHAMENTOS_POR_ITEM,
): any[] {
  const ehAcompanhamento = (c: any) => !!c?.semanaAcompanhamento;
  const automaticos = comentarios.filter(ehAcompanhamento);
  if (automaticos.length <= max) return comentarios;

  const manter = new Set(
    automaticos
      .slice()
      .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
      .slice(-max)
      .map((c) => c.id),
  );
  return comentarios.filter((c) => !ehAcompanhamento(c) || manter.has(c.id));
}

export type ResultadoAcompanhamento = {
  data: any;
  comentariosCriados: number;
  itensVisitados: number;
  semana: string;
};

/**
 * Devolve o estado com os comentários da semana acrescentados.
 *
 * Idempotente: cada item recebe no máximo um acompanhamento por semana, mesmo
 * que o cron dispare mais de uma vez ou que alguém rode manualmente.
 */
export function aplicarAcompanhamentoSemanal(
  data: any,
  agora: Date = new Date(),
  areas: string[] = AREAS_COM_ACOMPANHAMENTO,
): ResultadoAcompanhamento {
  const semana = chaveDaSemana(agora);
  let criados = 0;
  let visitados = 0;

  if (!data?.areas || !areas.length) {
    return { data, comentariosCriados: 0, itensVisitados: 0, semana };
  }

  const novasAreas = data.areas.map((area: any) => {
    if (!areas.includes(area.id)) return area;

    return {
      ...area,
      clientes: (area.clientes || []).map((cliente: any) => ({
        ...cliente,
        planos: (cliente.planos || []).map((plano: any) => ({
          ...plano,
          items: (plano.items || []).map((item: any) => {
            visitados++;
            if (jaTemDaSemana(item, semana)) return item;

            const texto = textoAcompanhamento(item, agora);
            if (!texto) return item;

            criados++;
            const novo = {
              id: `cm${uid()}`,
              tipo: "acompanhamento",
              semanaAcompanhamento: semana,
              date: dataBR(agora),
              created_at: agora.toISOString(),
              text: texto,
              autor_id: null,
              autor_nome: "sistema",
            };
            return {
              ...item,
              comentarios: podarAcompanhamentos([...(item.comentarios || []), novo]),
            };
          }),
        })),
      })),
    };
  });

  return {
    data: criados ? { ...data, areas: novasAreas } : data,
    comentariosCriados: criados,
    itensVisitados: visitados,
    semana,
  };
}
