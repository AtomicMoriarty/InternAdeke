// Roda com: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isoParaBR,
  passaNoFiltro,
  porCliente,
  porResponsavel,
  problemasDo,
  SEM_RESPONSAVEL,
  type CardTriagem,
} from "./triagemGrupos.ts";

const card = (extra: Partial<CardTriagem>): CardTriagem => ({
  itemId: Math.random().toString(36).slice(2),
  itemNome: "Demanda",
  clienteId: "c1",
  clienteNome: "Acme",
  areaId: "societario",
  responsaveis: [],
  prazo: "",
  ...extra,
});

const ESCRITORIO = "esc";

test("o que falta: dono e prazo; a conta do escritório não conta como dono", () => {
  assert.deepEqual(problemasDo(card({}), ESCRITORIO), { semDono: true, semPrazo: true });
  assert.deepEqual(problemasDo(card({ responsaveis: [ESCRITORIO] }), ESCRITORIO).semDono, true);
  assert.deepEqual(problemasDo(card({ responsaveis: ["ana"], prazo: "01/11/2026" }), ESCRITORIO), {
    semDono: false,
    semPrazo: false,
  });
});

test("filtro", () => {
  const ok = card({ responsaveis: ["ana"], prazo: "01/11/2026" });
  const semPrazo = card({ responsaveis: ["ana"] });
  const semDono = card({ prazo: "01/11/2026" });
  assert.equal(passaNoFiltro(ok, "todos"), false);
  assert.equal(passaNoFiltro(semPrazo, "semPrazo"), true);
  assert.equal(passaNoFiltro(semPrazo, "semDono"), false);
  assert.equal(passaNoFiltro(semDono, "semDono"), true);
  assert.equal(passaNoFiltro(semDono, "todos"), true);
});

test("por cliente: o mesmo cliente em duas áreas é um grupo só, o mais pendente primeiro", () => {
  const grupos = porCliente([
    card({ clienteNome: "Beta", responsaveis: ["ana"] }),
    card({ clienteNome: "Acme", clienteId: "c-soc" }),
    card({ clienteNome: "ACME ", clienteId: "c-inpi", areaId: "inpi", responsaveis: ["ana"] }),
  ]);
  assert.deepEqual(
    grupos.map((g) => [g.nome, g.cards.length, g.semDono, g.semPrazo, g.areas]),
    [
      ["Acme", 2, 1, 2, ["societario", "inpi"]],
      ["Beta", 1, 0, 1, ["societario"]],
    ],
  );
});

test("por responsável: sem dono primeiro, card de duas pessoas nas duas", () => {
  const nomes: Record<string, string> = { ana: "Ana", bruno: "Bruno" };
  const grupos = porResponsavel(
    [
      card({ responsaveis: ["ana", "bruno"] }),
      card({ responsaveis: ["bruno"] }),
      card({ responsaveis: [ESCRITORIO] }),
      card({}),
    ],
    (id) => nomes[id],
    ESCRITORIO,
  );
  assert.deepEqual(
    grupos.map((g) => [g.chave, g.nome, g.cards.length]),
    [
      [SEM_RESPONSAVEL, "Sem responsável", 2],
      ["bruno", "Bruno", 2],
      ["ana", "Ana", 1],
    ],
  );
});

test("data do campo para o formato do estado", () => {
  assert.equal(isoParaBR("2026-10-31"), "31/10/2026");
  assert.equal(isoParaBR(""), "");
});
