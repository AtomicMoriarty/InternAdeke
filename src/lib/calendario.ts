// O calendário de prazos: a grade do mês e a exportação para agenda (.ics).
//
// A linha do tempo (Gantt) mostra duração; a pergunta "o que vence na semana
// que vem?" é de calendário. E o prazo que importa precisa estar também na
// agenda de quem cuida dele — Google, Outlook, Apple —, que é onde a pessoa
// olha antes de marcar a reunião em cima do protocolo. O Trello faz isso com o
// Planner; aqui é um arquivo .ics que qualquer agenda importa.
//
// Fica sem imports com "@/" para rodar direto no node --test.

import { lerPrazo } from "./prazos.ts";

export type DiaDaGrade = { dia: string; doMes: boolean };

function doisDigitos(n: number) {
  return String(n).padStart(2, "0");
}

/** AAAA-MM-DD de uma data UTC. */
function isoDia(d: Date) {
  return `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`;
}

/**
 * As seis semanas que cobrem o mês, começando na segunda-feira.
 *
 * `mes` é 1–12. Seis semanas sempre, para a grade não mudar de altura de um
 * mês para o outro.
 */
export function gradeDoMes(ano: number, mes: number): DiaDaGrade[] {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1));
  // getUTCDay: domingo = 0. Quantos dias voltar até a segunda.
  const recuo = (primeiro.getUTCDay() + 6) % 7;
  const inicio = new Date(Date.UTC(ano, mes - 1, 1 - recuo));
  const dias: DiaDaGrade[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio.getTime() + i * 86400000);
    dias.push({ dia: isoDia(d), doMes: d.getUTCMonth() === mes - 1 });
  }
  return dias;
}

/** Mês seguinte ou anterior: {ano, mes} com mes 1–12. */
export function somarMes(ano: number, mes: number, delta: number) {
  const total = ano * 12 + (mes - 1) + delta;
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
}

/** Agrupa pelo dia do prazo. O que não tem prazo legível fica de fora. */
export function porDia<T extends { prazo: string }>(itens: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const it of itens) {
    const p = lerPrazo(it.prazo);
    if (!p) continue;
    const lista = mapa.get(p.dia) ?? [];
    lista.push(it);
    mapa.set(p.dia, lista);
  }
  return mapa;
}

// ─── .ics ────────────────────────────────────────────────────────────────────

export type EventoPrazo = {
  uid: string;
  titulo: string;
  prazo: string;
  descricao?: string;
  url?: string;
};

/** Escapa texto do iCalendar (RFC 5545, 3.3.11). */
function escapar(s: string) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
}

/** Linhas longas são dobradas em 75 octetos, continuando com um espaço. */
function dobrar(linha: string) {
  const bytes = new TextEncoder().encode(linha);
  if (bytes.length <= 75) return linha;
  const partes: string[] = [];
  let atual = "";
  let tamanho = 0;
  for (const ch of linha) {
    const n = new TextEncoder().encode(ch).length;
    if (tamanho + n > (partes.length ? 74 : 75)) {
      partes.push(atual);
      atual = "";
      tamanho = 0;
    }
    atual += ch;
    tamanho += n;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

/**
 * Um calendário .ics com um evento por prazo.
 *
 * Prazo com hora vira evento de uma hora, no fuso de Brasília; sem hora, vira
 * evento de dia inteiro. O uid é estável por card: importar de novo atualiza
 * o evento em vez de duplicar, nas agendas que respeitam o uid.
 */
export function gerarIcs(eventos: EventoPrazo[], agora = new Date()): string {
  const carimbo = agora
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Adeke Intern//Prazos//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Prazos Adeke",
    "X-WR-TIMEZONE:America/Sao_Paulo",
  ];
  for (const e of eventos) {
    const p = lerPrazo(e.prazo);
    if (!p) continue;
    const dia = p.dia.replace(/-/g, "");
    linhas.push("BEGIN:VEVENT", `UID:${e.uid}@adeke-intern`, `DTSTAMP:${carimbo}`);
    if (p.hora) {
      const [h, m] = p.hora.split(":").map(Number);
      const fim = `${doisDigitos(Math.min(h + 1, 23))}${doisDigitos(h + 1 > 23 ? 59 : m)}00`;
      linhas.push(
        `DTSTART;TZID=America/Sao_Paulo:${dia}T${doisDigitos(h)}${doisDigitos(m)}00`,
        `DTEND;TZID=America/Sao_Paulo:${dia}T${fim}`,
      );
    } else {
      const seguinte = isoDia(new Date(Date.parse(`${p.dia}T00:00:00Z`) + 86400000)).replace(
        /-/g,
        "",
      );
      linhas.push(`DTSTART;VALUE=DATE:${dia}`, `DTEND;VALUE=DATE:${seguinte}`);
    }
    linhas.push(`SUMMARY:${escapar(e.titulo)}`);
    if (e.descricao) linhas.push(`DESCRIPTION:${escapar(e.descricao)}`);
    if (e.url) linhas.push(`URL:${e.url}`);
    linhas.push("END:VEVENT");
  }
  linhas.push("END:VCALENDAR");
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}
