// Cálculos dos relatórios. Separado da tela para poder ser testado sozinho.
import { moduloOf, MODULO_PRODUTOS } from "@/lib/areas";
import type { DashboardState } from "@/lib/dashboardTypes";

export type Transicao = { de: string; para: string; em: string };

export type ItemPlano = {
  areaId: string;
  modulo: string;
  clienteId: string;
  clienteNome: string;
  planoId: string;
  planoNome: string;
  itemId: string;
  itemNome: string;
  status: string;
  responsaveis: string[];
  prazo: string; // DD/MM/AAAA
  dataInicio: string; // DD/MM/AAAA
  criadoEm: string | null;
  statusChangedAt: string | null;
  statusHistory: Transicao[];
  comentarios: {
    id: string;
    created_at?: string;
    date?: string;
    autor_id: string | null;
    autor_nome: string;
    text: string;
  }[];
  checklistTotal: number;
  checklistFeitos: number;
};

const DIA_MS = 86400000;

export function parseBR(s?: string | null): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

function meiaNoite(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function diasEntre(a: Date, b: Date): number {
  return Math.round((meiaNoite(b).getTime() - meiaNoite(a).getTime()) / DIA_MS);
}

/** Achata o dashboard_state numa lista plana de itens, com os campos dos relatórios. */
export function achatarItens(data: DashboardState | null): ItemPlano[] {
  const out: ItemPlano[] = [];
  for (const area of data?.areas || []) {
    for (const cliente of area.clientes || []) {
      for (const plano of cliente.planos || []) {
        for (const item of plano.items || []) {
          const checklist = Array.isArray(item.checklist) ? item.checklist : [];
          out.push({
            areaId: area.id,
            modulo: moduloOf(area.id),
            clienteId: cliente.id,
            clienteNome: cliente.name,
            planoId: plano.id,
            planoNome: plano.name,
            itemId: item.id,
            itemNome: item.name,
            status: item.kanbanStatus || "A Fazer",
            responsaveis: Array.isArray(item.responsaveis) ? item.responsaveis : [],
            prazo: item.prazo || "",
            dataInicio: item.dataInicio || "",
            criadoEm: item.criadoEm || null,
            statusChangedAt: item.statusChangedAt || null,
            statusHistory: Array.isArray(item.statusHistory) ? item.statusHistory : [],
            comentarios: Array.isArray(item.comentarios) ? item.comentarios : [],
            checklistTotal: checklist.length,
            checklistFeitos: checklist.filter((c) => c.done).length,
          });
        }
      }
    }
  }
  // Produtos ficam fora de data.areas e tambem entram nos relatorios
  for (const prod of data?.produtos || []) {
    for (const item of prod.items || []) {
      const checklist = Array.isArray(item.checklist) ? item.checklist : [];
      out.push({
        areaId: "produtos",
        modulo: MODULO_PRODUTOS,
        clienteId: prod.id,
        clienteNome: prod.name,
        planoId: prod.id,
        planoNome: prod.name,
        itemId: item.id,
        itemNome: item.name,
        status: item.kanbanStatus || "A Fazer",
        responsaveis: Array.isArray(item.responsaveis) ? item.responsaveis : [],
        prazo: item.prazo || "",
        dataInicio: item.dataInicio || "",
        criadoEm: item.criadoEm || null,
        statusChangedAt: item.statusChangedAt || null,
        statusHistory: Array.isArray(item.statusHistory) ? item.statusHistory : [],
        comentarios: Array.isArray(item.comentarios) ? item.comentarios : [],
        checklistTotal: checklist.length,
        checklistFeitos: checklist.filter((c) => c.done).length,
      });
    }
  }

  return out;
}

/**
 * Quanto tempo o item passou em cada etapa, em dias.
 * Antes da primeira transição o item estava no status `de` dela, contado a
 * partir de criadoEm. Depois da última, está no status atual até agora.
 */
export function tempoPorEtapa(item: ItemPlano, agora = new Date()): Record<string, number> {
  const acc: Record<string, number> = {};
  const add = (status: string, ini: Date, fim: Date) => {
    const d = Math.max(0, (fim.getTime() - ini.getTime()) / DIA_MS);
    acc[status] = (acc[status] || 0) + d;
  };

  const hist = [...item.statusHistory]
    .filter((t) => t && t.em)
    .sort((a, b) => a.em.localeCompare(b.em));

  if (!hist.length) {
    const ini = item.statusChangedAt
      ? new Date(item.statusChangedAt)
      : item.criadoEm
        ? new Date(item.criadoEm)
        : null;
    if (ini && !isNaN(ini.getTime())) add(item.status, ini, agora);
    return acc;
  }

  const nascimento = item.criadoEm ? new Date(item.criadoEm) : new Date(hist[0].em);
  add(hist[0].de, nascimento, new Date(hist[0].em));

  for (let i = 0; i < hist.length; i++) {
    const ini = new Date(hist[i].em);
    const fim = i + 1 < hist.length ? new Date(hist[i + 1].em) : agora;
    add(hist[i].para, ini, fim);
  }
  return acc;
}

/** Dias desde a última mudança de status (ou desde a criação, se nunca mudou). */
export function diasParado(item: ItemPlano, agora = new Date()): number | null {
  const ref = item.statusChangedAt || item.criadoEm;
  if (!ref) return null;
  const d = new Date(ref);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, diasEntre(d, agora));
}

/** Dias desde a data de início (quanto tempo a demanda está aberta). */
export function diasEmAberto(item: ItemPlano, agora = new Date()): number | null {
  const ini = parseBR(item.dataInicio) || (item.criadoEm ? new Date(item.criadoEm) : null);
  if (!ini || isNaN(ini.getTime())) return null;
  return Math.max(0, diasEntre(ini, agora));
}

export type SituacaoPrazo = "sem_prazo" | "vencido" | "hoje" | "proximo" | "futuro";

export function situacaoPrazo(
  item: ItemPlano,
  agora = new Date(),
): { situacao: SituacaoPrazo; dias: number | null } {
  const p = parseBR(item.prazo);
  if (!p) return { situacao: "sem_prazo", dias: null };
  const d = diasEntre(agora, p);
  if (d < 0) return { situacao: "vencido", dias: d };
  if (d === 0) return { situacao: "hoje", dias: 0 };
  if (d <= 7) return { situacao: "proximo", dias: d };
  return { situacao: "futuro", dias: d };
}

export type CargaPessoa = {
  userId: string;
  total: number;
  porStatus: Record<string, number>;
  concluidos: number;
  vencidos: number;
  parados7: number;
  mediaDiasEmAberto: number | null;
};

/** Quantas demandas cada pessoa tem, e em que estado. */
export function cargaPorPessoa(itens: ItemPlano[], agora = new Date()): CargaPessoa[] {
  const mapa = new Map<string, CargaPessoa>();
  const somaDias = new Map<string, number[]>();

  for (const item of itens) {
    for (const uid of item.responsaveis) {
      if (!mapa.has(uid)) {
        mapa.set(uid, {
          userId: uid,
          total: 0,
          porStatus: {},
          concluidos: 0,
          vencidos: 0,
          parados7: 0,
          mediaDiasEmAberto: null,
        });
        somaDias.set(uid, []);
      }
      const c = mapa.get(uid)!;
      c.total++;
      c.porStatus[item.status] = (c.porStatus[item.status] || 0) + 1;
      if (item.status === "Finalizado") c.concluidos++;
      if (situacaoPrazo(item, agora).situacao === "vencido" && item.status !== "Finalizado")
        c.vencidos++;
      const dp = diasParado(item, agora);
      if (dp !== null && dp >= 7 && item.status !== "Finalizado") c.parados7++;
      const da = diasEmAberto(item, agora);
      if (da !== null) somaDias.get(uid)!.push(da);
    }
  }

  for (const [uid, c] of mapa) {
    const arr = somaDias.get(uid)!;
    c.mediaDiasEmAberto = arr.length
      ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
      : null;
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

/** Média de dias que os itens passam em cada etapa, no conjunto todo. */
export function mediaTempoPorEtapa(
  itens: ItemPlano[],
  agora = new Date(),
): { status: string; mediaDias: number; amostras: number }[] {
  const soma: Record<string, number> = {};
  const cont: Record<string, number> = {};
  for (const item of itens) {
    const t = tempoPorEtapa(item, agora);
    for (const [status, dias] of Object.entries(t)) {
      soma[status] = (soma[status] || 0) + dias;
      cont[status] = (cont[status] || 0) + 1;
    }
  }
  return Object.keys(soma)
    .map((status) => ({
      status,
      mediaDias: Math.round((soma[status] / cont[status]) * 10) / 10,
      amostras: cont[status],
    }))
    .sort((a, b) => b.mediaDias - a.mediaDias);
}

export type EventoAtividade = {
  tipo: "status" | "comentario";
  em: string;
  item: ItemPlano;
  descricao: string;
  autorId: string | null;
  autorNome: string | null;
};

/** Tudo que aconteceu num intervalo: mudanças de status e comentários. */
export function atividadeNoPeriodo(
  itens: ItemPlano[],
  desde: Date,
  agora = new Date(),
): EventoAtividade[] {
  const ev: EventoAtividade[] = [];
  const dentro = (iso?: string) => {
    if (!iso) return false;
    const d = new Date(iso);
    return !isNaN(d.getTime()) && d >= desde && d <= agora;
  };

  for (const item of itens) {
    for (const t of item.statusHistory) {
      if (!dentro(t.em)) continue;
      ev.push({
        tipo: "status",
        em: t.em,
        item,
        descricao: `${t.de} → ${t.para}`,
        autorId: null,
        autorNome: null,
      });
    }
    for (const c of item.comentarios) {
      const iso = c.created_at;
      if (!dentro(iso)) continue;
      ev.push({
        tipo: "comentario",
        em: iso!,
        item,
        descricao: c.text,
        autorId: c.autor_id,
        autorNome: c.autor_nome,
      });
    }
  }
  return ev.sort((a, b) => b.em.localeCompare(a.em));
}

/** Itens sem movimento há mais tempo, do mais parado para o menos. */
export function itensParados(
  itens: ItemPlano[],
  minDias = 7,
  agora = new Date(),
): { item: ItemPlano; dias: number }[] {
  return itens
    .filter((i) => i.status !== "Finalizado")
    .map((i) => ({ item: i, dias: diasParado(i, agora) ?? -1 }))
    .filter((x) => x.dias >= minDias)
    .sort((a, b) => b.dias - a.dias);
}

/** Gera CSV a partir de linhas já formatadas. */
export function paraCSV(cabecalho: string[], linhas: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cabecalho.map(esc).join(";"), ...linhas.map((l) => l.map(esc).join(";"))].join("\n");
}

export function baixarCSV(nomeArquivo: string, conteudo: string) {
  // BOM para o Excel abrir acentuação corretamente
  const blob = new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
