// Estrutura das anotações de um card.
//
// A anotação já existia como texto solto. O que faltava não era gaveta — era o
// que transforma anotação em acompanhamento:
//
//   tipo      → dá para filtrar e contar
//   desfecho  → separa "liguei" de "liguei, reunião marcada dia 17"
//   próximo passo com data → é o único campo que cobra alguém depois
//
// O próximo passo é o que justifica o resto. Um campo de próximo passo que não
// aparece fora do card não serve para nada, então ele sobe para o topo da
// atividade, para a página Eu e para o funil comercial.

import type { DashboardState, Area, Cliente, Plano, Item, Comentario } from "@/lib/dashboardTypes";
import { parseBR } from "@/lib/relatorios";

export type TipoRegistro = {
  id: string;
  nome: string;
  cor: string;
  /** Este tipo pergunta canal e desfecho? Só o follow-up precisa. */
  detalhado?: boolean;
  /** Gerado pelo sistema: não aparece no seletor de escrita. */
  automatico?: boolean;
};

export const TIPOS: TipoRegistro[] = [
  { id: "followup", nome: "Follow-up", cor: "#3B82F6", detalhado: true },
  { id: "feedback", nome: "Feedback", cor: "#8B5CF6" },
  { id: "observacao", nome: "Observação", cor: "#64748B" },
  { id: "atualizacao", nome: "Atualização", cor: "#10B981" },
  { id: "acompanhamento", nome: "Acompanhamento", cor: "#F59E0B", automatico: true },
];

/** Os tipos que a pessoa escolhe ao escrever. */
export const TIPOS_ESCRITA = TIPOS.filter((t) => !t.automatico);

export const TIPO_PADRAO = "observacao";

export function tipoPorId(id: string): TipoRegistro | undefined {
  return TIPOS.find((t) => t.id === id);
}

/**
 * Que tipo é esta anotação.
 *
 * Tudo que foi escrito antes desta estrutura existir está gravado como
 * "comentario" ou sem tipo nenhum. Vira observação: é o que de fato era.
 */
export function tipoDoRegistro(c: Comentario): string {
  const t = typeof c?.tipo === "string" ? c.tipo : "";
  if (TIPOS.some((x) => x.id === t)) return t;
  return TIPO_PADRAO;
}

export function corDoRegistro(c: Comentario): string {
  return tipoPorId(tipoDoRegistro(c))?.cor || "#64748B";
}

export function nomeDoTipo(id: string): string {
  return tipoPorId(id)?.nome || "Observação";
}

// ─── Canais de contato ───────────────────────────────────────────────────────

export const CANAIS = ["Ligação", "WhatsApp", "E-mail", "Reunião", "Presencial", "Outro"];

// ─── Próximo passo ───────────────────────────────────────────────────────────

/** A anotação deixou um próximo passo em aberto? */
export function temPassoAberto(c: Comentario): boolean {
  return Boolean(c?.proximoPasso && !c?.concluidoEm);
}

export type PassoPendente = {
  registroId: string;
  texto: string;
  /** Data no formato DD/MM/AAAA, como o resto do sistema. */
  quando: string;
  data: Date | null;
  autorId: string | null;
  autorNome: string;
  atrasado: boolean;
};

function montarPasso(c: Comentario, hoje: Date): PassoPendente {
  const quando = typeof c.proximoPassoEm === "string" ? c.proximoPassoEm : "";
  const data = parseBR(quando);
  // Comparar só a data: um passo marcado para hoje não nasce atrasado às 14h.
  const limite = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return {
    registroId: c.id,
    texto: String(c.proximoPasso || ""),
    quando,
    data,
    autorId: c.autor_id ?? null,
    autorNome: c.autor_nome || "",
    atrasado: Boolean(data && data < limite),
  };
}

/**
 * Passos em aberto de um card, do mais urgente para o menos.
 *
 * Passo sem data vai para o fim: é compromisso vago, não é o que vence hoje.
 */
export function passosAbertos(item: Item, hoje: Date = new Date()): PassoPendente[] {
  const registros = Array.isArray(item?.comentarios) ? (item.comentarios as Comentario[]) : [];
  return registros
    .filter(temPassoAberto)
    .map((c) => montarPasso(c, hoje))
    .sort((a, b) => {
      if (a.data && b.data) return a.data.getTime() - b.data.getTime();
      if (a.data) return -1;
      if (b.data) return 1;
      return 0;
    });
}

/** O próximo passo que importa agora. É este que sobe para o topo do card. */
export function proximoPasso(item: Item, hoje: Date = new Date()): PassoPendente | null {
  return passosAbertos(item, hoje)[0] || null;
}

/** Marca o passo como cumprido sem apagar a anotação que o registrou. */
export function concluirPasso(
  item: Item,
  registroId: string,
  agora: Date = new Date(),
): { comentarios: Comentario[] } {
  const registros = Array.isArray(item?.comentarios) ? (item.comentarios as Comentario[]) : [];
  return {
    comentarios: registros.map((c) =>
      c.id !== registroId ? c : { ...c, concluidoEm: agora.toISOString() },
    ),
  };
}

// ─── Leitura da árvore inteira ───────────────────────────────────────────────

export type PassoNoContexto = PassoPendente & {
  areaId: string;
  clienteId: string;
  clienteNome: string;
  planoId: string;
  planoNome: string;
  itemId: string;
  itemNome: string;
  responsaveis: string[];
};

/**
 * Todos os passos em aberto do sistema, com o caminho até o card.
 *
 * Percorre áreas e produtos, porque quem prometeu retornar não se importa em
 * qual das duas estruturas o card mora.
 */
export function passosDaArvore(data: DashboardState, hoje: Date = new Date()): PassoNoContexto[] {
  const out: PassoNoContexto[] = [];

  const coletar = (
    item: Item,
    ctx: Omit<PassoNoContexto, keyof PassoPendente | "itemId" | "itemNome" | "responsaveis">,
  ) => {
    for (const passo of passosAbertos(item, hoje)) {
      out.push({
        ...passo,
        ...ctx,
        itemId: item.id,
        itemNome: item.name || "",
        responsaveis: Array.isArray(item.responsaveis) ? item.responsaveis : [],
      });
    }
  };

  for (const area of (data?.areas || []) as Area[]) {
    for (const cliente of (area.clientes || []) as Cliente[]) {
      for (const plano of (cliente.planos || []) as Plano[]) {
        for (const item of (plano.items || []) as Item[]) {
          coletar(item, {
            areaId: area.id,
            clienteId: cliente.id,
            clienteNome: cliente.name || "",
            planoId: plano.id,
            planoNome: plano.name || "",
          });
        }
      }
    }
  }

  // Produtos guardam itens num nível só: fazem papel de cliente e de plano.
  for (const produto of data?.produtos || []) {
    for (const item of produto.items || []) {
      coletar(item, {
        areaId: "produtos",
        clienteId: produto.id,
        clienteNome: produto.name || "",
        planoId: produto.id,
        planoNome: produto.name || "",
      });
    }
  }

  return out.sort((a, b) => {
    if (a.data && b.data) return a.data.getTime() - b.data.getTime();
    if (a.data) return -1;
    if (b.data) return 1;
    return 0;
  });
}

/**
 * Os passos que são meus.
 *
 * Vale quem escreveu a anotação e quem responde pelo card: prometer retorno e
 * ser dono da demanda são os dois jeitos de a coisa ficar com você.
 */
export function meusPassos(
  data: DashboardState,
  userId: string | null,
  hoje: Date = new Date(),
): PassoNoContexto[] {
  if (!userId) return [];
  return passosDaArvore(data, hoje).filter(
    (p) => p.autorId === userId || p.responsaveis.includes(userId),
  );
}

/**
 * Conclui um passo a partir de qualquer lugar, sem abrir o card.
 *
 * Recebe o caminho junto porque quem lista os passos (a página Eu, o funil) só
 * tem o contexto, não o item. Atravessa áreas e produtos: o card pode morar
 * em qualquer uma das duas estruturas.
 */
export function aplicarConclusao(
  data: DashboardState,
  alvo: { clienteId: string; planoId: string; itemId: string; registroId: string },
  agora: Date = new Date(),
): DashboardState {
  const patch = (item: Item) =>
    item.id !== alvo.itemId ? item : { ...item, ...concluirPasso(item, alvo.registroId, agora) };

  return {
    ...data,
    areas: (data.areas || []).map((a: Area) => ({
      ...a,
      clientes: (a.clientes || []).map((c: Cliente) =>
        c.id !== alvo.clienteId
          ? c
          : {
              ...c,
              planos: (c.planos || []).map((pl: Plano) =>
                pl.id !== alvo.planoId ? pl : { ...pl, items: (pl.items || []).map(patch) },
              ),
            },
      ),
    })),
    produtos: (data.produtos || []).map((pr) =>
      pr.id !== alvo.clienteId ? pr : { ...pr, items: (pr.items || []).map(patch) },
    ),
  };
}

// ─── Contagens ───────────────────────────────────────────────────────────────

export function contarPorTipo(item: Item): Record<string, number> {
  const registros = Array.isArray(item?.comentarios) ? (item.comentarios as Comentario[]) : [];
  const out: Record<string, number> = {};
  for (const c of registros) {
    const t = tipoDoRegistro(c);
    out[t] = (out[t] || 0) + 1;
  }
  return out;
}

/** Quando foi o último contato registrado. Silêncio longo é sinal ruim. */
export function ultimoFollowup(item: Item): Comentario | null {
  const registros = Array.isArray(item?.comentarios) ? (item.comentarios as Comentario[]) : [];
  const followups = registros
    .filter((c) => tipoDoRegistro(c) === "followup")
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return followups[0] || null;
}

export function diasDesdeUltimoContato(item: Item, agora: Date = new Date()): number | null {
  const ultimo = ultimoFollowup(item);
  if (!ultimo?.created_at) return null;
  const d = new Date(String(ultimo.created_at));
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((agora.getTime() - d.getTime()) / 86400000));
}
