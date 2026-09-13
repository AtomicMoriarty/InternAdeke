// Aplica a mesma alteração a vários cards de uma vez.
//
// Os itens vivem em dois formatos: dentro de data.areas (area → cliente → plano
// → item) e dentro de data.produtos (produto → item). Uma seleção pode misturar
// os dois, então tudo aqui trabalha sobre a lista plana de cards e resolve o
// caminho de cada um na hora de gravar.

import type { FlatCard, KanbanStatus } from "@/lib/flattenItems";

export const PRODUTOS_AREA_ID = "produtos";

const DIA_MS = 86400000;

function uid() {
  return `_${Math.random().toString(36).slice(2, 9)}`;
}

export type AcaoEmLote =
  | { tipo: "status"; status: KanbanStatus }
  | { tipo: "responsaveis"; ids: string[]; modo: "adicionar" | "substituir" | "remover" }
  | { tipo: "comentario"; texto: string; autorId: string | null; autorNome: string }
  | { tipo: "prazo"; prazo: string }
  | { tipo: "acompanhamento"; ligado: boolean };

/** Aplica a ação a um item. Devolve o mesmo objeto quando não há mudança. */
function aplicarNoItem(item: any, acao: AcaoEmLote, agora: Date): any {
  switch (acao.tipo) {
    case "status": {
      const atual = item.kanbanStatus || item.status || "A Fazer";
      if (atual === acao.status) return item;
      const iso = agora.toISOString();
      return {
        ...item,
        status: acao.status,
        kanbanStatus: acao.status,
        statusChangedAt: iso,
        statusHistory: [
          ...(Array.isArray(item.statusHistory) ? item.statusHistory : []),
          { de: atual, para: acao.status, em: iso },
        ].slice(-50),
      };
    }

    case "responsaveis": {
      const atuais: string[] = Array.isArray(item.responsaveis) ? item.responsaveis : [];
      let proximos: string[];
      if (acao.modo === "substituir") proximos = [...acao.ids];
      else if (acao.modo === "remover") proximos = atuais.filter((id) => !acao.ids.includes(id));
      else proximos = [...new Set([...atuais, ...acao.ids])];
      const igual =
        proximos.length === atuais.length && proximos.every((id) => atuais.includes(id));
      return igual ? item : { ...item, responsaveis: proximos };
    }

    case "comentario": {
      const texto = acao.texto.trim();
      if (!texto) return item;
      return {
        ...item,
        comentarios: [
          ...(item.comentarios || []),
          {
            id: `cm${uid()}`,
            tipo: "comentario",
            date: `${String(agora.getDate()).padStart(2, "0")}/${String(agora.getMonth() + 1).padStart(2, "0")}/${agora.getFullYear()}`,
            created_at: agora.toISOString(),
            text: texto,
            autor_id: acao.autorId,
            autor_nome: acao.autorNome,
          },
        ],
      };
    }

    case "prazo":
      return item.prazo === acao.prazo ? item : { ...item, prazo: acao.prazo };

    case "acompanhamento":
      return item.acompanhamentoSemanal === acao.ligado
        ? item
        : { ...item, acompanhamentoSemanal: acao.ligado };

    default:
      return item;
  }
}

export type ResultadoLote = {
  data: any;
  alterados: number;
};

/**
 * Aplica `acao` a todos os cards de `selecionados`.
 *
 * Percorre a árvore uma vez só, em vez de uma passada por card — com dezenas de
 * cards selecionados a diferença aparece.
 */
export function aplicarEmLote(
  data: any,
  selecionados: FlatCard[],
  acao: AcaoEmLote,
  agora: Date = new Date(),
): ResultadoLote {
  if (!data || !selecionados.length) return { data, alterados: 0 };

  // itemId basta como chave: os ids são únicos no estado inteiro
  const alvo = new Set(selecionados.map((c) => c.itemId));
  let alterados = 0;

  const mapear = (item: any) => {
    if (!alvo.has(item.id)) return item;
    const novo = aplicarNoItem(item, acao, agora);
    if (novo !== item) alterados++;
    return novo;
  };

  const areas = (data.areas || []).map((a: any) => ({
    ...a,
    clientes: (a.clientes || []).map((c: any) => ({
      ...c,
      planos: (c.planos || []).map((p: any) => ({
        ...p,
        items: (p.items || []).map(mapear),
      })),
    })),
  }));

  const produtos = (data.produtos || []).map((p: any) => ({
    ...p,
    items: (p.items || []).map(mapear),
  }));

  return alterados ? { data: { ...data, areas, produtos }, alterados } : { data, alterados: 0 };
}

/** Descrição curta do que a ação fará, para confirmar antes de aplicar. */
export function descreverAcao(acao: AcaoEmLote, quantos: number): string {
  const cards = `${quantos} ${quantos === 1 ? "card" : "cards"}`;
  switch (acao.tipo) {
    case "status":
      return `Mover ${cards} para "${acao.status}"`;
    case "responsaveis": {
      const verbo =
        acao.modo === "remover" ? "Remover" : acao.modo === "substituir" ? "Definir" : "Adicionar";
      return `${verbo} ${acao.ids.length} responsável(is) em ${cards}`;
    }
    case "comentario":
      return `Comentar em ${cards}`;
    case "prazo":
      return acao.prazo ? `Definir prazo em ${cards}` : `Limpar prazo de ${cards}`;
    case "acompanhamento":
      return `${acao.ligado ? "Ligar" : "Desligar"} acompanhamento semanal em ${cards}`;
    default:
      return `Alterar ${cards}`;
  }
}
