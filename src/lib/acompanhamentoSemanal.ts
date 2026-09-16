// Acompanhamento semanal automático.
//
// Roda no worker, por Cron Trigger, sem depender de alguém ter o app aberto.
// Para cada item em aberto das áreas configuradas, posta um comentário com a
// situação da semana: status, há quanto tempo está parado e como anda o prazo.
//
// Vale por card, nao por area: quem acompanha liga no card que quer seguir de
// perto. Assim o registro semanal aparece onde importa — tipicamente processos
// do INPI, onde o valor esta em ver "nada mudou ha 3 semanas" — sem encher de
// ruido os cards que ninguem esta monitorando.
//
// Desligado por padrao. Um card so entra quando alguem liga.

import type { DashboardState, Item, Comentario } from "@/lib/dashboardTypes";
import { globalDeQualquerArea } from "@/lib/etapas";

/** Campo do item que liga o acompanhamento. */
export const CAMPO_ACOMPANHAMENTO = "acompanhamentoSemanal";

/** O card esta marcado para acompanhamento? */
export function temAcompanhamento(item: Item | undefined | null): boolean {
  return item?.[CAMPO_ACOMPANHAMENTO] === true;
}

/**
 * Quantos acompanhamentos manter por item.
 *
 * O teto existe porque o dashboard_state e carregado inteiro a cada abertura do
 * app, e comentario semanal cresce para sempre. Como agora e opt-in por card,
 * sao poucos cards e da para guardar mais historico: doze semanas, cerca de tres
 * meses. Comentario escrito por pessoa nunca e removido.
 */
export const MAX_ACOMPANHAMENTOS_POR_ITEM = 12;

const DIA_MS = 86400000;

function parseBR(s?: string | null): Date | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

function diasEntre(a: Date, b: Date): number {
  const x = new Date(a);
  x.setHours(0, 0, 0, 0);
  const y = new Date(b);
  y.setHours(0, 0, 0, 0);
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

function statusDoItem(item: Item): string {
  return item?.kanbanStatus || item?.status || "A Fazer";
}

/** Monta o texto do acompanhamento. Devolve null quando não há o que dizer. */
export function textoAcompanhamento(item: Item, agora: Date): string | null {
  const status = statusDoItem(item);
  // "Indeferida" no INPI equivale a Finalizado: sem isto, um processo negado
  // continuaria recebendo o comentario semanal para sempre.
  if (globalDeQualquerArea(status) === "Finalizado") return null;

  const partes = [`Status: ${status}`];

  const desde = item.statusChangedAt || item.criadoEm;
  if (desde) {
    const d = new Date(desde);
    if (!isNaN(d.getTime())) {
      const dias = Math.max(0, diasEntre(d, agora));
      partes.push(
        dias === 0
          ? "mudou hoje"
          : dias === 1
            ? "há 1 dia nesta etapa"
            : `há ${dias} dias nesta etapa`,
      );
    }
  }

  const prazo = parseBR(item.prazo);
  if (prazo) {
    const dias = diasEntre(agora, prazo);
    partes.push(
      dias < 0
        ? `prazo vencido há ${Math.abs(dias)} dia${Math.abs(dias) !== 1 ? "s" : ""}`
        : dias === 0
          ? "prazo vence hoje"
          : `prazo em ${dias} dia${dias !== 1 ? "s" : ""}`,
    );
  }

  const checklist = Array.isArray(item.checklist) ? item.checklist : [];
  if (checklist.length) {
    partes.push(`checklist ${checklist.filter((c) => c.done).length}/${checklist.length}`);
  }

  return `Acompanhamento semanal - ${partes.join(" · ")}`;
}

/** Já existe acompanhamento desta semana neste item? */
function jaTemDaSemana(item: Item, semana: string): boolean {
  return (item.comentarios || []).some((c) => c?.semanaAcompanhamento === semana);
}

/**
 * Mantem so os acompanhamentos mais recentes, preservando a ordem original e
 * todos os comentarios escritos por pessoas.
 */
export function podarAcompanhamentos(
  comentarios: Comentario[],
  max: number = MAX_ACOMPANHAMENTOS_POR_ITEM,
): Comentario[] {
  const ehAcompanhamento = (c: Comentario) => !!c?.semanaAcompanhamento;
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
  data: DashboardState;
  comentariosCriados: number;
  itensVisitados: number; // cards com acompanhamento ligado
  semana: string;
};

/**
 * Devolve o estado com os comentários da semana acrescentados.
 *
 * Idempotente: cada item recebe no máximo um acompanhamento por semana, mesmo
 * que o cron dispare mais de uma vez ou que alguém rode manualmente.
 */
export function aplicarAcompanhamentoSemanal(
  data: DashboardState,
  agora: Date = new Date(),
): ResultadoAcompanhamento {
  const semana = chaveDaSemana(agora);
  let criados = 0;
  let visitados = 0;

  if (!data?.areas) {
    return { data, comentariosCriados: 0, itensVisitados: 0, semana };
  }

  const novasAreas = (data.areas || []).map((area) => {
    return {
      ...area,
      clientes: (area.clientes || []).map((cliente) => ({
        ...cliente,
        planos: (cliente.planos || []).map((plano) => ({
          ...plano,
          items: (plano.items || []).map((item) => {
            if (!temAcompanhamento(item)) return item;
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
