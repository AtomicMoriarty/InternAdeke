// Folha de horas: as contas e o que vai para a planilha.
//
// Um apontamento é um intervalo de trabalho numa demanda (o card) e, se for
// o caso, numa subdemanda (um item da checklist do card). Daqui saem os
// totais nos três níveis que o escritório pergunta — subdemanda, demanda e
// cliente — e as linhas da exportação, uma por intervalo, com dia, início,
// fim, duração e o que era o trabalho.
//
// Fica sem imports com "@/" para rodar direto no node --test.

import type { Aba, Celula } from "./planilha.ts";

export type Apontamento = {
  id: string;
  user_id: string;
  area_id: string;
  cliente_id: string;
  cliente_dir_id: string | null;
  cliente_nome: string;
  plano_id: string | null;
  plano_nome: string;
  item_id: string;
  item_nome: string;
  subitem_id: string | null;
  subitem_nome: string | null;
  descricao: string;
  inicio: string;
  fim: string | null;
  created_at?: string;
  updated_at?: string;
};

/** Onde o tempo está sendo lançado: o card e, se for o caso, a subdemanda. */
export type AlvoDoTempo = {
  area_id: string;
  cliente_id: string;
  cliente_dir_id: string | null;
  cliente_nome: string;
  plano_id: string | null;
  plano_nome: string;
  item_id: string;
  item_nome: string;
  subitem_id?: string | null;
  subitem_nome?: string | null;
};

/** Teto de um apontamento, igual ao do banco. */
export const MAX_SEG = 24 * 3600;
/** A partir daqui o cronômetro provavelmente foi esquecido ligado. */
export const ALERTA_SEG = 10 * 3600;

/** Segundos de um apontamento; o que está rodando conta até agora. */
export function duracaoSeg(a: Pick<Apontamento, "inicio" | "fim">, agora = new Date()): number {
  const ini = Date.parse(a.inicio);
  const fim = a.fim ? Date.parse(a.fim) : agora.getTime();
  if (Number.isNaN(ini) || Number.isNaN(fim)) return 0;
  return Math.max(0, Math.round((fim - ini) / 1000));
}

/** "2h 05min", "45min", "menos de 1min". Para os totais da tela. */
export function formatarDuracao(seg: number): string {
  const min = Math.floor(seg / 60);
  if (min < 1) return seg > 0 ? "menos de 1min" : "0min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h ${String(m).padStart(2, "0")}min` : `${h}h`;
}

/** "1:02:03". Para o cronômetro andando. */
export function formatarRelogio(seg: number): string {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Lê uma duração digitada, do jeito que as pessoas escrevem.
 *
 * "1h30", "1h 30min", "1:30", "90min", "45m", "1,5h", "1.5" → horas e minutos.
 * Número inteiro sozinho: até 12 é hora ("2" = 2h), acima é minuto ("90" =
 * 1h30) — a tela mostra a leitura ao lado, para ninguém lançar 2 minutos
 * achando que lançou 2 horas.
 */
export function lerDuracao(texto: string): number | null {
  const s = String(texto || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(",", ".");
  if (!s) return null;
  let m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60;
  m = s.match(/^(?:(\d+(?:\.\d+)?)h(?:oras?)?)?(?:(\d+)(?:m|min|minutos?)?)?$/);
  if (m && (m[1] || m[2]) && s.includes("h")) {
    return Math.round(Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60);
  }
  m = s.match(/^(\d+)(?:m|min|minutos?)$/);
  if (m) return Number(m[1]) * 60;
  m = s.match(/^(\d+\.\d+)$/);
  if (m) return Math.round(Number(m[1]) * 3600);
  m = s.match(/^(\d+)$/);
  if (m) {
    const n = Number(m[1]);
    return n <= 12 ? n * 3600 : n * 60;
  }
  return null;
}

/** Data local a partir de "AAAA-MM-DD" e "HH:MM". */
export function combinarDataHora(dia: string, hora: string): Date | null {
  const d = String(dia || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const h = String(hora || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !h) return null;
  const data = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(h[1]), Number(h[2]));
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * Confere um intervalo lançado à mão. Devolve o erro em português, ou null.
 *
 * Fim antes do início vira o dia seguinte quando a pessoa atravessou a
 * meia-noite ("22:00 às 01:00"); quem chama decide se aceita essa leitura.
 */
export function erroNoIntervalo(inicio: Date | null, fim: Date | null, agora = new Date()) {
  if (!inicio) return "Informe o dia e a hora de início.";
  if (!fim) return "Informe a hora de fim ou a duração.";
  if (fim.getTime() <= inicio.getTime()) return "O fim precisa ser depois do início.";
  if ((fim.getTime() - inicio.getTime()) / 1000 > MAX_SEG) return "Um lançamento vai até 24 horas.";
  if (inicio.getTime() > agora.getTime() + 60_000) return "O início está no futuro.";
  return null;
}

// ─── Totais ──────────────────────────────────────────────────────────────────

export type TotalSubdemanda = { id: string | null; nome: string; seg: number };
export type TotalDemanda = {
  itemId: string;
  nome: string;
  areaId: string;
  planoNome: string;
  seg: number;
  /** Por item da checklist; id null é o tempo lançado no card sem subdemanda. */
  subdemandas: TotalSubdemanda[];
};
export type TotalCliente = { chave: string; nome: string; seg: number; demandas: TotalDemanda[] };

/** Chave do cliente: o id do diretório, que junta o cliente de todas as áreas. */
export function chaveCliente(a: Pick<Apontamento, "cliente_dir_id" | "cliente_id">) {
  return a.cliente_dir_id || `area:${a.cliente_id}`;
}

/**
 * Cliente → demanda → subdemanda, com o tempo de cada nível. Do maior para o
 * menor. Os nomes vêm do apontamento mais recente de cada um.
 */
export function totalizar(aps: Apontamento[], agora = new Date()): TotalCliente[] {
  const clientes = new Map<
    string,
    TotalCliente & { _d: Map<string, TotalDemanda & { _s: Map<string, TotalSubdemanda> }> }
  >();
  const recentes = [...aps].sort((a, b) => a.inicio.localeCompare(b.inicio));
  for (const a of recentes) {
    const seg = duracaoSeg(a, agora);
    const ck = chaveCliente(a);
    let c = clientes.get(ck);
    if (!c) {
      c = { chave: ck, nome: a.cliente_nome, seg: 0, demandas: [], _d: new Map() };
      clientes.set(ck, c);
    }
    c.nome = a.cliente_nome || c.nome;
    c.seg += seg;
    let d = c._d.get(a.item_id);
    if (!d) {
      d = {
        itemId: a.item_id,
        nome: a.item_nome,
        areaId: a.area_id,
        planoNome: a.plano_nome,
        seg: 0,
        subdemandas: [],
        _s: new Map(),
      };
      c._d.set(a.item_id, d);
    }
    d.nome = a.item_nome || d.nome;
    d.seg += seg;
    const sk = a.subitem_id || "";
    let s = d._s.get(sk);
    if (!s) {
      s = { id: a.subitem_id || null, nome: a.subitem_nome || "", seg: 0 };
      d._s.set(sk, s);
    }
    s.nome = a.subitem_nome || s.nome;
    s.seg += seg;
  }
  const porTempo = <T extends { seg: number; nome: string }>(x: T, y: T) =>
    y.seg - x.seg || x.nome.localeCompare(y.nome);
  return [...clientes.values()]
    .map(({ _d, ...c }) => ({
      ...c,
      demandas: [..._d.values()]
        .map(({ _s, ...d }) => ({ ...d, subdemandas: [..._s.values()].sort(porTempo) }))
        .sort(porTempo),
    }))
    .sort(porTempo);
}

/** Soma de uma lista, do jeito que a tela mostra no rodapé. */
export function somaSeg(aps: Apontamento[], agora = new Date()) {
  return aps.reduce((s, a) => s + duracaoSeg(a, agora), 0);
}

// ─── Planilha ────────────────────────────────────────────────────────────────

/** Horas em número, com duas casas: o que se multiplica pelo valor da hora. */
export function horasDecimais(seg: number) {
  return Math.round((seg / 3600) * 100) / 100;
}

/**
 * As abas da exportação: os lançamentos um a um, e os totais por cliente e
 * por demanda (com a subdemanda), prontos para conferir ou faturar.
 */
export function abasDaFolha(
  aps: Apontamento[],
  nomes: { pessoa: (userId: string) => string; area: (areaId: string) => string },
  agora = new Date(),
): Aba[] {
  const ordenados = [...aps].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const lancamentos: Celula[][] = ordenados.map((a) => {
    const seg = duracaoSeg(a, agora);
    const ini = new Date(a.inicio);
    return [
      ini,
      ini,
      a.fim ? new Date(a.fim) : "rodando",
      { duracaoSeg: seg },
      horasDecimais(seg),
      nomes.pessoa(a.user_id),
      a.cliente_nome,
      nomes.area(a.area_id),
      a.plano_nome,
      a.item_nome,
      a.subitem_nome || "",
      a.descricao,
    ];
  });

  const totais = totalizar(aps, agora);
  const porCliente: Celula[][] = totais.map((c) => [
    c.nome,
    c.demandas.length,
    { duracaoSeg: c.seg },
    horasDecimais(c.seg),
  ]);
  const porDemanda: Celula[][] = totais.flatMap((c) =>
    c.demandas.flatMap((d) => {
      const comSub = d.subdemandas.filter((s) => s.id);
      const linhaDemanda: Celula[] = [
        c.nome,
        nomes.area(d.areaId),
        d.nome,
        comSub.length ? "(total da demanda)" : "",
        { duracaoSeg: d.seg },
        horasDecimais(d.seg),
      ];
      const linhasSub: Celula[][] = comSub.length
        ? d.subdemandas.map((s) => [
            c.nome,
            nomes.area(d.areaId),
            d.nome,
            s.id ? s.nome : "(direto na demanda)",
            { duracaoSeg: s.seg },
            horasDecimais(s.seg),
          ])
        : [];
      return [linhaDemanda, ...linhasSub];
    }),
  );

  return [
    {
      nome: "Lançamentos",
      colunas: [
        { titulo: "Data", formato: "data", largura: 11 },
        { titulo: "Início", formato: "hora", largura: 8 },
        { titulo: "Fim", formato: "hora", largura: 8 },
        { titulo: "Duração", formato: "duracao", largura: 9 },
        { titulo: "Horas", formato: "numero", largura: 7 },
        { titulo: "Pessoa", largura: 18 },
        { titulo: "Cliente", largura: 26 },
        { titulo: "Área", largura: 16 },
        { titulo: "Plano", largura: 20 },
        { titulo: "Demanda", largura: 34 },
        { titulo: "Subdemanda", largura: 28 },
        { titulo: "O que foi feito", largura: 50 },
      ],
      linhas: lancamentos,
    },
    {
      nome: "Por cliente",
      colunas: [
        { titulo: "Cliente", largura: 30 },
        { titulo: "Demandas", largura: 10 },
        { titulo: "Duração", formato: "duracao", largura: 10 },
        { titulo: "Horas", formato: "numero", largura: 8 },
      ],
      linhas: porCliente,
    },
    {
      nome: "Por demanda",
      colunas: [
        { titulo: "Cliente", largura: 26 },
        { titulo: "Área", largura: 16 },
        { titulo: "Demanda", largura: 34 },
        { titulo: "Subdemanda", largura: 30 },
        { titulo: "Duração", formato: "duracao", largura: 10 },
        { titulo: "Horas", formato: "numero", largura: 8 },
      ],
      linhas: porDemanda,
    },
  ];
}
