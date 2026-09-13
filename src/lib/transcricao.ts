// Leitura de transcrição de reunião, sem IA.
//
// O que dá para fazer bem sem modelo de linguagem, e o que não dá:
//
// DÁ — numa transcrição cada fala tem dono. Quando alguém diz "eu fico de
// mandar a proposta até sexta", o falante É o responsável e o prazo está na
// frase. Isso resolve sozinho a parte mais difícil de extrair tarefa, que é
// saber a quem atribuir. Reconhecer quem participou é igualmente direto.
//
// NÃO DÁ — escrever "o que foi conversado" em prosa. Isso é resumo, exige
// entender o assunto, e heurística faz feio. Por isso este módulo não tenta:
// ele devolve sugestões de frases que a pessoa aceita ou descarta, e o texto
// corrido continua sendo escrito por quem estava lá.
//
// Nada aqui grava nada. A tela mostra as sugestões, a pessoa edita, e só então
// os encaminhamentos viram card pelo caminho que já existe.

import type { Profile } from "@/lib/profiles";

export type Fala = {
  /** O nome como apareceu na transcrição. */
  falante: string;
  texto: string;
};

// Rótulos de quem falou, na ordem em que valem a pena testar. Cobre o que as
// ferramentas de transcrição costumam emitir.
const ROTULOS: RegExp[] = [
  // **Nome:** texto  |  **Nome:** texto   (markdown, dois-pontos dentro ou fora)
  /^\s*\*\*\s*([^*:]{2,40}?)\s*:?\s*\*\*\s*:?\s*(.*)$/,
  // [00:12:34] Nome: texto   |   [Nome] texto
  /^\s*\[(?:\d{1,2}:)?\d{1,2}:\d{2}\]\s*([^:]{2,40}?)\s*:\s*(.*)$/,
  /^\s*\[\s*([^\]]{2,40}?)\s*\]\s*:?\s*(.*)$/,
  // Nome (00:12:34): texto   |   Nome (00:12): texto
  /^\s*([^():]{2,40}?)\s*\((?:\d{1,2}:)?\d{1,2}:\d{2}\)\s*:\s*(.*)$/,
  // 00:12:34 Nome: texto
  /^\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s+([^:]{2,40}?)\s*:\s*(.*)$/,
  // Nome - 00:12: texto
  /^\s*([^-:]{2,40}?)\s*[-–]\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*:?\s*(.*)$/,
  // Nome: texto   (o mais comum; por último para não roubar dos outros)
  /^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'\s]{1,39}?)\s*:\s+(.*)$/,
];

function semAcento(s: string) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Quebra a transcrição em falas.
 *
 * Linha sem rótulo é continuação da fala anterior — transcrição longa quebra
 * parágrafo sem repetir quem está falando.
 */
export function separarFalas(texto: string): Fala[] {
  const linhas = String(texto || "")
    .replace(/\r/g, "\n")
    .split("\n");
  const out: Fala[] = [];

  for (const linha of linhas) {
    if (!linha.trim()) continue;
    let casou: { falante: string; texto: string } | null = null;
    for (const re of ROTULOS) {
      const m = linha.match(re);
      if (m) {
        const falante = m[1].trim().replace(/\s+/g, " ");
        // "Bom" de "Bom dia:" não é nome. Nome tem no máximo quatro palavras.
        if (falante.split(" ").length <= 4) {
          casou = { falante, texto: (m[2] || "").trim() };
        }
        break;
      }
    }
    if (casou) {
      out.push(casou);
    } else if (out.length) {
      out[out.length - 1].texto = `${out[out.length - 1].texto} ${linha.trim()}`.trim();
    } else {
      // Texto antes de qualquer rótulo: transcrição sem marcação de falante.
      out.push({ falante: "", texto: linha.trim() });
    }
  }
  return out.filter((f) => f.texto);
}

/** Casa o nome que apareceu na transcrição com um perfil do escritório. */
function perfilDoNome(nome: string, profiles: Profile[]): Profile | undefined {
  const alvo = semAcento(nome);
  if (!alvo) return undefined;
  const exato = profiles.find((p) => semAcento(p.display_name) === alvo);
  if (exato) return exato;
  // Transcrição costuma trazer só o primeiro nome.
  const primeiro = alvo.split(" ")[0];
  const porPrimeiro = profiles.filter((p) => semAcento(p.display_name).split(" ")[0] === primeiro);
  // Só aceita se não houver dois "Bruno" no escritório.
  return porPrimeiro.length === 1 ? porPrimeiro[0] : undefined;
}

export type Participantes = {
  /** Ids de quem é do escritório. */
  conhecidos: string[];
  /** Nomes que apareceram e não batem com ninguém cadastrado. */
  externos: string[];
};

export function participantesDaTranscricao(falas: Fala[], profiles: Profile[]): Participantes {
  const conhecidos: string[] = [];
  const externos: string[] = [];
  const vistos = new Set<string>();

  for (const f of falas) {
    const nome = f.falante.trim();
    if (!nome || vistos.has(semAcento(nome))) continue;
    vistos.add(semAcento(nome));
    const p = perfilDoNome(nome, profiles);
    if (p) {
      if (!conhecidos.includes(p.id)) conhecidos.push(p.id);
    } else {
      externos.push(nome);
    }
  }
  return { conhecidos, externos };
}

// ─── Compromissos ────────────────────────────────────────────────────────────

/** Quem fala assume a tarefa: primeira pessoa. */
const EU_ASSUMO = [
  "eu vou",
  "vou ",
  "eu fico de",
  "fico de",
  "eu faco",
  "eu envio",
  "eu mando",
  "eu ligo",
  "eu falo com",
  "eu vejo",
  "eu preparo",
  "eu monto",
  "eu reviso",
  "eu confirmo",
  "eu agendo",
  "eu levanto",
  "eu assumo",
  "eu cuido",
  "deixa comigo",
  "pode deixar comigo",
  "me encarrego",
  "fica comigo",
];

/** Alguém atribui a outra pessoa. */
const VOCE_FAZ = [
  "voce pode",
  "voce vai",
  "vc pode",
  "vc vai",
  "voce fica de",
  "fica de",
  "consegue ",
  "pede pro",
  "pede para",
];

/** Marcas de prazo. Guardadas como texto, não convertidas em data. */
const RE_PRAZO =
  /\b(at[ée]\s+(?:o\s+dia\s+)?\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?|at[ée]\s+(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|amanh[ãa]|hoje|sexta-feira)|amanh[ãa]|semana que vem|pr[óo]xima semana|at[ée]\s+o\s+fim\s+da\s+semana|no\s+m[áa]ximo\s+at[ée][^.,;]{0,20})/i;

export type Sugestao = {
  /** A frase como foi dita, limpa. */
  texto: string;
  /** Quem fica responsável, quando dá para saber. */
  responsavelId?: string;
  /** Nome de quem falou, para a pessoa conferir a origem. */
  falante: string;
  /** Trecho de prazo encontrado na frase, sem virar data. */
  prazo?: string;
  /** alta = verbo de compromisso em primeira pessoa. media = o resto. */
  confianca: "alta" | "media";
};

/** Abreviacoes que terminam em ponto sem terminar a frase. */
const ABREVIACOES = [
  "dr",
  "dra",
  "sr",
  "sra",
  "prof",
  "profa",
  "exmo",
  "art",
  "inc",
  "no",
  "ltda",
  "sa",
];

/**
 * Quebra em frases sem tropecar em abreviacao.
 *
 * "eu ligo para o Dr. Marcos amanha" e uma frase so — cortar no ponto do "Dr."
 * partia o compromisso ao meio e perdia o prazo que vinha no fim.
 */
function frases(texto: string): string[] {
  const bruto = String(texto).split(/(?<=[.!?])\s+|;\s+/);
  const out: string[] = [];
  for (const pedaco of bruto) {
    const anterior = out[out.length - 1];
    const terminaEmAbreviacao =
      anterior &&
      ABREVIACOES.includes(semAcento(anterior.split(/\s+/).pop() || "").replace(".", ""));
    // Inicial solta ("J. Silva") tambem nao termina frase.
    const inicialSolta = anterior && /\b[A-Z]\.$/.test(anterior.trim());
    if ((terminaEmAbreviacao || inicialSolta) && anterior.trim().endsWith(".")) {
      out[out.length - 1] = `${anterior} ${pedaco}`.trim();
    } else {
      out.push(pedaco.trim());
    }
  }
  return out.map((f) => f.trim()).filter((f) => f.length > 12);
}

/**
 * Compromissos ditos na reunião.
 *
 * A regra que carrega o resultado: em primeira pessoa, quem fala é o dono.
 * É por isso que transcrição rende tarefa melhor do que ata escrita depois —
 * ali a autoria já está no texto.
 */
export function compromissosDaTranscricao(falas: Fala[], profiles: Profile[]): Sugestao[] {
  const out: Sugestao[] = [];
  const vistas = new Set<string>();

  for (const fala of falas) {
    const dono = perfilDoNome(fala.falante, profiles);
    for (const frase of frases(fala.texto)) {
      const n = semAcento(frase);
      const primeiraPessoa = EU_ASSUMO.some((v) => n.includes(v));
      const paraOutro = VOCE_FAZ.some((v) => n.includes(v));
      const mencao = frase.match(/@([a-zA-Z0-9._-]+)/);
      if (!primeiraPessoa && !paraOutro && !mencao) continue;

      const chave = n.slice(0, 90);
      if (vistas.has(chave)) continue;
      vistas.add(chave);

      let responsavelId = primeiraPessoa ? dono?.id : undefined;
      if (mencao) {
        const p = profiles.find((x) => semAcento(x.username || "") === semAcento(mencao[1]));
        if (p) responsavelId = p.id;
      }
      if (!responsavelId && paraOutro) {
        // "o Bruno vai montar" — procura um nome do escritorio na frase.
        for (const p of profiles) {
          const primeiro = semAcento(p.display_name).split(" ")[0];
          if (primeiro.length > 2 && new RegExp(`\\b${primeiro}\\b`).test(n)) {
            responsavelId = p.id;
            break;
          }
        }
      }

      const prazo = frase.match(RE_PRAZO)?.[0];
      out.push({
        texto: frase.replace(/\s+/g, " ").trim(),
        responsavelId,
        falante: fala.falante,
        prazo: prazo || undefined,
        confianca: primeiraPessoa ? "alta" : "media",
      });
      if (out.length >= 40) return out;
    }
  }
  // Compromisso em primeira pessoa primeiro: é o mais confiável.
  return out.sort((a, b) => (a.confianca === b.confianca ? 0 : a.confianca === "alta" ? -1 : 1));
}

// ─── Decisões ────────────────────────────────────────────────────────────────

const MARCAS_DE_DECISAO = [
  "ficou decidido",
  "ficou acordado",
  "ficou definido",
  "decidimos",
  "definimos",
  "acordamos",
  "combinado que",
  "combinamos",
  "vamos seguir com",
  "vamos com",
  "optamos por",
  "a decisao e",
  "fechado que",
  "consenso",
];

/**
 * Frases que soam a decisão.
 *
 * Isto é achar frase, não escrever resumo — a diferença importa. Vem como
 * sugestão para a pessoa aceitar, nunca preenchido sozinho.
 */
export function decisoesDaTranscricao(falas: Fala[]): string[] {
  const out: string[] = [];
  const vistas = new Set<string>();
  for (const fala of falas) {
    for (const frase of frases(fala.texto)) {
      const n = semAcento(frase);
      if (!MARCAS_DE_DECISAO.some((m) => n.includes(m))) continue;
      const chave = n.slice(0, 90);
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      out.push(frase.replace(/\s+/g, " ").trim());
      if (out.length >= 20) return out;
    }
  }
  return out;
}

// ─── Resultado da leitura ────────────────────────────────────────────────────

export type LeituraTranscricao = {
  falas: Fala[];
  participantes: Participantes;
  compromissos: Sugestao[];
  decisoes: string[];
  /** Quantas falas sem rótulo de quem falou. Muitas = transcrição sem marcação. */
  semFalante: number;
  /** Avisos honestos sobre o que não deu para extrair. */
  observacoes: string[];
};

export function lerTranscricao(texto: string, profiles: Profile[] = []): LeituraTranscricao {
  const falas = separarFalas(texto);
  const participantes = participantesDaTranscricao(falas, profiles);
  const compromissos = compromissosDaTranscricao(falas, profiles);
  const decisoes = decisoesDaTranscricao(falas);
  const semFalante = falas.filter((f) => !f.falante).length;

  const observacoes: string[] = [];
  if (!falas.length) {
    observacoes.push("Cole a transcrição para eu ler.");
  } else {
    if (semFalante === falas.length) {
      observacoes.push(
        "Não achei marcação de quem falou. Sem isso não dá para saber de quem é cada tarefa — " +
          "as sugestões vêm sem responsável.",
      );
    }
    if (!compromissos.length) {
      observacoes.push(
        'Nenhum compromisso reconhecido. Procuro frases como "eu fico de", "vou mandar", ' +
          '"você consegue" — se a reunião não teve isso dito em voz alta, escreva os ' +
          "encaminhamentos à mão.",
      );
    }
    if (!decisoes.length) {
      observacoes.push(
        "Nenhuma decisão reconhecida. O resumo do que foi conversado continua sendo seu — " +
          "isto aqui só acha frases, não escreve texto.",
      );
    }
  }
  return { falas, participantes, compromissos, decisoes, semFalante, observacoes };
}

// ─── Data dita em voz alta ───────────────────────────────────────────────────
//
// "até sexta" só vira data se você souber que dia foi a reunião. Por isso a
// conversão mora aqui e recebe a data da reunião como referência — e o
// resultado é sugestão, que a pessoa confirma na tabela antes de virar card.

const DIAS_DA_SEMANA: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

function paraBR(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function somarDias(d: Date, n: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Próxima ocorrência do dia da semana, contando o próprio dia da referência. */
function proximoDiaDaSemana(ref: Date, alvo: number) {
  const delta = (alvo - ref.getDay() + 7) % 7;
  return somarDias(ref, delta);
}

/**
 * Converte o prazo dito em data, usando o dia da reunião como referência.
 *
 * Devolve "" quando não dá para ter certeza — data errada num card é pior do
 * que card sem data, porque ninguém desconfia dela.
 */
export function dataSugerida(prazoTexto: string, referencia: Date = new Date()): string {
  const t = semAcento(prazoTexto);
  if (!t) return "";

  if (/\bhoje\b/.test(t)) return paraBR(referencia);
  if (/\bamanha\b/.test(t)) return paraBR(somarDias(referencia, 1));
  if (/semana que vem|proxima semana/.test(t)) return paraBR(somarDias(referencia, 7));
  if (/fim da semana|final da semana/.test(t)) return paraBR(proximoDiaDaSemana(referencia, 5));

  // "até 20/10/2026", "até 20/10", "até o dia 20"
  const comData = t.match(/(\d{1,2})(?:\/(\d{1,2})(?:\/(\d{2,4}))?)?/);
  if (comData && /\d/.test(t)) {
    const dia = Number(comData[1]);
    if (dia >= 1 && dia <= 31) {
      const mes = comData[2] ? Number(comData[2]) - 1 : referencia.getMonth();
      let ano = comData[3]
        ? Number(comData[3]) < 100
          ? 2000 + Number(comData[3])
          : Number(comData[3])
        : referencia.getFullYear();
      const alvo = new Date(ano, mes, dia);
      // Dia sem mês que já passou é do mês seguinte: "até o dia 5" dito no dia 20.
      if (!comData[2] && alvo < referencia) {
        alvo.setMonth(alvo.getMonth() + 1);
        ano = alvo.getFullYear();
      }
      // Guarda contra "31 de fevereiro" e afins.
      if (alvo.getDate() !== dia) return "";
      return paraBR(alvo);
    }
  }

  for (const [nome, num] of Object.entries(DIAS_DA_SEMANA)) {
    if (new RegExp(`\\b${nome}`).test(t)) return paraBR(proximoDiaDaSemana(referencia, num));
  }
  return "";
}
