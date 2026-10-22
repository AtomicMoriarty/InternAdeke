// Operadores da busca global, no jeito do Trello.
//
// A busca por texto acha o card quando a pessoa lembra do nome. A pergunta do
// dia a dia é outra: "o que está atrasado do Bruno no INPI?". Com operadores
// ela cabe numa linha:
//
//   @bruno            responsável (nome ou usuário, começo da palavra)
//   #urgente          etiqueta
//   prazo:vencido     também prazo:hoje, prazo:semana (próximos 7 dias), prazo:sem
//   area:inpi         id ou nome curto da área; area:produtos para produtos
//   status:aberto     ou status:encerrado
//
// O que sobra depois dos operadores continua sendo procurado como texto. Os
// operadores só filtram cards: com algum deles na busca, telas e clientes
// saem da lista.
//
// Fica sem imports com "@/" para rodar direto no node --test.

import { globalDeQualquerArea } from "./etapas.ts";
import { lerPrazo } from "./prazos.ts";

export type FiltroPrazo = "vencido" | "hoje" | "semana" | "sem";
export type FiltroStatus = "aberto" | "encerrado";

export type Filtros = {
  /** O texto livre que sobrou, para a busca de sempre. */
  texto: string;
  pessoas: string[];
  etiquetas: string[];
  prazo: FiltroPrazo | null;
  areas: string[];
  status: FiltroStatus | null;
};

/** O que um card precisa ter para ser filtrado: um pedaço do FlatCard. */
export type CardFiltravel = {
  responsaveis: string[];
  etiquetas: string[];
  prazo: string;
  areaId: string;
  modulo: string;
  etapa?: string;
  kanbanStatus: string;
};

export type PessoaBusca = { id: string; nome: string; usuario?: string };

export function semAcento(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const PRAZOS: Record<string, FiltroPrazo> = {
  vencido: "vencido",
  vencidos: "vencido",
  atrasado: "vencido",
  atrasados: "vencido",
  hoje: "hoje",
  semana: "semana",
  sem: "sem",
  nenhum: "sem",
};

const STATUS: Record<string, FiltroStatus> = {
  aberto: "aberto",
  abertos: "aberto",
  encerrado: "encerrado",
  encerrados: "encerrado",
  finalizado: "encerrado",
  finalizados: "encerrado",
};

/** Separa operadores e texto livre. Operador desconhecido fica como texto. */
export function lerFiltros(termo: string): Filtros {
  const f: Filtros = {
    texto: "",
    pessoas: [],
    etiquetas: [],
    prazo: null,
    areas: [],
    status: null,
  };
  const livres: string[] = [];
  for (const pedaco of String(termo || "")
    .split(/\s+/)
    .filter(Boolean)) {
    const p = semAcento(pedaco);
    if (p.length > 1 && p.startsWith("@")) {
      f.pessoas.push(p.slice(1));
      continue;
    }
    if (p.length > 1 && p.startsWith("#")) {
      f.etiquetas.push(p.slice(1));
      continue;
    }
    const op = p.match(/^(prazo|area|status):(.+)$/);
    if (op) {
      const [, chave, valor] = op;
      if (chave === "prazo" && PRAZOS[valor]) {
        f.prazo = PRAZOS[valor];
        continue;
      }
      if (chave === "status" && STATUS[valor]) {
        f.status = STATUS[valor];
        continue;
      }
      if (chave === "area") {
        f.areas.push(valor);
        continue;
      }
    }
    livres.push(pedaco);
  }
  f.texto = livres.join(" ");
  return f;
}

export function temFiltro(f: Filtros): boolean {
  return !!(f.pessoas.length || f.etiquetas.length || f.prazo || f.areas.length || f.status);
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);
}

/**
 * O card passa por todos os operadores?
 *
 * `hoje` é o dia (AAAA-MM-DD) contra o qual os prazos são comparados.
 */
export function cardPassa(
  card: CardFiltravel,
  f: Filtros,
  hoje: string,
  pessoas: PessoaBusca[],
): boolean {
  for (const quem of f.pessoas) {
    const ids = new Set(
      pessoas
        .filter((p) =>
          [p.nome, p.usuario || ""].some((n) =>
            semAcento(n)
              .split(/[\s._-]+/)
              .some((parte) => parte.startsWith(quem)),
          ),
        )
        .map((p) => p.id),
    );
    if (!card.responsaveis.some((id) => ids.has(id))) return false;
  }

  for (const etiqueta of f.etiquetas) {
    if (!card.etiquetas.some((e) => semAcento(e).includes(etiqueta))) return false;
  }

  if (f.areas.length) {
    const daqui = [semAcento(card.areaId), semAcento(card.modulo)];
    if (!f.areas.some((a) => daqui.some((d) => d.startsWith(a)))) return false;
  }

  const global = globalDeQualquerArea(card.etapa || card.kanbanStatus);
  const encerrado = global === "Finalizado" || global === "Suspenso";
  if (f.status === "aberto" && encerrado) return false;
  if (f.status === "encerrado" && !encerrado) return false;

  if (f.prazo) {
    const prazo = lerPrazo(card.prazo);
    if (f.prazo === "sem") return !prazo;
    if (!prazo || encerrado) return false;
    const dias = diasEntre(hoje, prazo.dia);
    if (f.prazo === "vencido" && dias >= 0) return false;
    if (f.prazo === "hoje" && dias !== 0) return false;
    if (f.prazo === "semana" && (dias < 0 || dias > 7)) return false;
  }

  return true;
}
