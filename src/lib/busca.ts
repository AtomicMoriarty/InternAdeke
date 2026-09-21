// A regra da busca global: o que encontra o quê.
//
// Fica em lib e não no componente porque é regra, não desenho — e porque é o
// que os testes exercitam.

import type { FlatCard } from "@/lib/flattenItems";
import { AREAS, areaById } from "@/lib/areas";
import { corDoEstado, globalDeQualquerArea } from "@/lib/etapas";

/** Para onde ir quando alguém escolhe um resultado. */
export type Destino =
  | { tipo: "card"; areaId: string; clienteId: string; planoId: string; itemId: string }
  | { tipo: "cliente"; areaId: string; clienteId: string }
  | { tipo: "tela"; rota: "/" | "/quadro" | "/eu"; pagina?: string; areaId?: string };

type Resultado = {
  chave: string;
  grupo: "Cards" | "Clientes" | "Telas";
  titulo: string;
  detalhe: string;
  cor: string;
  destino: Destino;
  /** Menor é melhor: começo do nome ganha de meio do nome. */
  peso: number;
  /** Card de processo já encerrado, mostrado mais abaixo e marcado. */
  encerrado?: boolean;
};

function semAcento(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Procura em card, cliente e tela ao mesmo tempo.
 *
 * Todos os pedaços do que foi digitado precisam aparecer em algum lugar do
 * texto do item — assim "incrivel aditivo" acha o card certo mesmo com as
 * palavras separadas e fora de ordem, que é como as pessoas lembram das
 * coisas.
 */
export function procurar(
  termo: string,
  cards: FlatCard[],
  clientes: { id: string; nome: string; apelidos?: string[] }[],
  limite = 30,
): Resultado[] {
  const pedacos = semAcento(termo).split(/\s+/).filter(Boolean);
  if (!pedacos.length) return [];

  const casa = (texto: string) => {
    const t = semAcento(texto);
    if (!pedacos.every((p) => t.includes(p))) return null;
    // Quem começa com o que foi digitado aparece antes.
    return t.startsWith(pedacos[0]) ? 0 : 1;
  };

  const out: Resultado[] = [];

  for (const a of AREAS) {
    const peso = casa(`${a.name} ${a.modulo}`);
    if (peso === null) continue;
    out.push({
      chave: `area:${a.id}`,
      grupo: "Telas",
      titulo: a.name,
      detalhe: "Abrir o quadro da área",
      cor: a.cardColor,
      destino: { tipo: "tela", rota: "/", pagina: "area", areaId: a.id },
      peso,
    });
  }
  for (const [nome, pagina, rota] of [
    ["Quadro Geral", "", "/quadro"],
    ["Eu", "", "/eu"],
    ["Triagem", "triagem", "/"],
    ["Clientes", "clientes", "/"],
    ["Painel Geral", "dashboard", "/"],
  ] as const) {
    const peso = casa(nome);
    if (peso === null) continue;
    out.push({
      chave: `tela:${nome}`,
      grupo: "Telas",
      titulo: nome,
      detalhe: "Ir para a tela",
      cor: "#64748B",
      destino: { tipo: "tela", rota, pagina: pagina || undefined },
      peso,
    });
  }

  for (const c of clientes) {
    const peso = casa(`${c.nome} ${(c.apelidos || []).join(" ")}`);
    if (peso === null) continue;
    out.push({
      chave: `cli:${c.id}`,
      grupo: "Clientes",
      titulo: c.nome,
      detalhe: (c.apelidos || []).length ? `também: ${(c.apelidos || []).join(", ")}` : "Cliente",
      cor: "#0DD3C5",
      destino: { tipo: "tela", rota: "/", pagina: "clientes" },
      peso,
    });
  }

  for (const c of cards) {
    // A etapa entra na busca: "oposição" e "prazo recursal" são como as
    // pessoas perguntam pelo trabalho do INPI, tanto quanto pelo nome da marca.
    const peso = casa(
      `${c.itemNome} ${c.clienteNome} ${c.planoNome} ${c.etapa || c.kanbanStatus} ` +
        `${(c.etiquetas || []).join(" ")}`,
    );
    if (peso === null) continue;
    // Card encerrado desce. Dos 487 do escritório, 338 são histórico do
    // Trello: sem isto, procurar "aditivo" devolve dez contratos já
    // assinados antes do que está em cima da mesa agora.
    const encerrado = globalDeQualquerArea(c.etapa || c.kanbanStatus) === "Finalizado";
    const area = areaById(c.areaId);
    out.push({
      chave: `card:${c.itemId}`,
      grupo: "Cards",
      titulo: c.itemNome,
      detalhe: `${c.clienteNome} · ${area?.name || c.modulo} · ${c.etapa || c.kanbanStatus}`,
      cor: corDoEstado(c.etapa || c.kanbanStatus),
      destino: {
        tipo: "card",
        areaId: c.areaId,
        clienteId: c.clienteId,
        planoId: c.planoId,
        itemId: c.itemId,
      },
      peso: encerrado ? peso + 10 : peso,
      encerrado,
    });
  }

  const ordem = { Telas: 0, Clientes: 1, Cards: 2 };
  return out
    .sort(
      (a, b) =>
        a.peso - b.peso || ordem[a.grupo] - ordem[b.grupo] || a.titulo.localeCompare(b.titulo),
    )
    .slice(0, limite);
}
