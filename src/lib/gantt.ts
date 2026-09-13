// Cálculos da visão Gantt, separados da tela para poderem ser testados.

import { achatarItens, parseBR, type ItemPlano } from "@/lib/relatorios";

const DIA_MS = 86400000;

export type BarraGantt = {
  item: ItemPlano;
  inicio: Date;
  fim: Date;
  /** Fim veio do prazo, ou foi estimado por falta dele? */
  fimEstimado: boolean;
  atrasado: boolean;
};

export type DadosGantt = {
  barras: BarraGantt[];
  /** Itens que não dá para posicionar: falta data de início e prazo. */
  semDatas: ItemPlano[];
  /** Extremos da janela desenhada. */
  de: Date;
  ate: Date;
  totalDias: number;
};

function meiaNoite(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function diasEntre(a: Date, b: Date): number {
  return Math.round((meiaNoite(b).getTime() - meiaNoite(a).getTime()) / DIA_MS);
}

export function somarDias(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * Descobre a barra de um item.
 *
 * Um item entra na linha do tempo se tiver ao menos uma das duas datas:
 * - com as duas, a barra vai de uma à outra;
 * - só com início, estende até hoje (ou até o início, se for futuro) e marca
 *   como estimada, para a tela poder desenhar diferente;
 * - só com prazo, começa uma semana antes dele, o suficiente para aparecer.
 *
 * Sem nenhuma das duas, devolve null e o item vai para a lista de pendências.
 */
export function barraDoItem(item: ItemPlano, hoje: Date): BarraGantt | null {
  const ini = parseBR(item.dataInicio) || (item.criadoEm ? new Date(item.criadoEm) : null);
  const fim = parseBR(item.prazo);
  const iniValido = ini && !isNaN(ini.getTime()) ? meiaNoite(ini) : null;
  const fimValido = fim && !isNaN(fim.getTime()) ? meiaNoite(fim) : null;

  if (!iniValido && !fimValido) return null;

  let inicio: Date;
  let termino: Date;
  let estimado = false;

  if (iniValido && fimValido) {
    inicio = iniValido;
    termino = fimValido;
  } else if (iniValido) {
    inicio = iniValido;
    termino = meiaNoite(hoje) > iniValido ? meiaNoite(hoje) : iniValido;
    estimado = true;
  } else {
    termino = fimValido!;
    inicio = somarDias(termino, -7);
    estimado = true;
  }

  // Barra de um dia só fica invisível; garante largura mínima de 1 dia.
  if (termino < inicio) termino = inicio;

  const atrasado =
    !!fimValido && item.status !== "Finalizado" && meiaNoite(hoje) > fimValido;

  return { item, inicio, fim: termino, fimEstimado: estimado, atrasado };
}

/**
 * Monta a visão a partir do estado, já com a janela de datas calculada.
 * A janela recebe uma folga de alguns dias de cada lado para as barras não
 * encostarem na borda, e sempre inclui hoje.
 */
export function montarGantt(data: any, hoje: Date = new Date(), folgaDias = 3): DadosGantt {
  const itens = data ? achatarItens(data) : [];
  const barras: BarraGantt[] = [];
  const semDatas: ItemPlano[] = [];

  for (const item of itens) {
    const b = barraDoItem(item, hoje);
    if (b) barras.push(b);
    else semDatas.push(item);
  }

  barras.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

  const marcos = [meiaNoite(hoje), ...barras.flatMap((b) => [b.inicio, b.fim])];
  const de = somarDias(new Date(Math.min(...marcos.map((d) => d.getTime()))), -folgaDias);
  const ate = somarDias(new Date(Math.max(...marcos.map((d) => d.getTime()))), folgaDias);

  return { barras, semDatas, de, ate, totalDias: Math.max(1, diasEntre(de, ate)) };
}

/** Posição e largura da barra, em porcentagem da janela. */
export function posicaoDaBarra(barra: BarraGantt, de: Date, totalDias: number) {
  const inicio = Math.max(0, diasEntre(de, barra.inicio));
  const duracao = Math.max(1, diasEntre(barra.inicio, barra.fim) + 1);
  return {
    esquerda: (inicio / totalDias) * 100,
    largura: Math.min(100 - (inicio / totalDias) * 100, (duracao / totalDias) * 100),
  };
}

/** Marcas de mês para o cabeçalho da régua. */
export function marcasDeMes(de: Date, ate: Date, totalDias: number) {
  const marcas: { rotulo: string; esquerda: number }[] = [];
  const cursor = new Date(de.getFullYear(), de.getMonth(), 1);
  while (cursor <= ate) {
    if (cursor >= de) {
      marcas.push({
        rotulo: cursor.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        esquerda: (diasEntre(de, cursor) / totalDias) * 100,
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return marcas;
}
