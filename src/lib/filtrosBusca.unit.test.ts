// Roda com: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardPassa, lerFiltros, temFiltro, type CardFiltravel } from "./filtrosBusca.ts";

const pessoas = [
  { id: "u1", nome: "Bruno Pacca", usuario: "bruno" },
  { id: "u2", nome: "Ana Lúcia", usuario: "analu" },
];

const card = (extra: Partial<CardFiltravel> = {}): CardFiltravel => ({
  responsaveis: ["u1"],
  etiquetas: ["URGENTE"],
  prazo: "20/10/2026",
  areaId: "inpi",
  modulo: "INPI",
  kanbanStatus: "Em Andamento",
  ...extra,
});

const hoje = "2026-10-22";

test("separa operadores do texto livre", () => {
  const f = lerFiltros("aditivo @bruno #urgente prazo:vencido area:inpi status:aberto incrível");
  assert.deepEqual(f, {
    texto: "aditivo incrível",
    pessoas: ["bruno"],
    etiquetas: ["urgente"],
    prazo: "vencido",
    areas: ["inpi"],
    status: "aberto",
  });
  assert.equal(temFiltro(f), true);
});

test("operador desconhecido fica como texto, e @ sozinho também", () => {
  const f = lerFiltros("prazo:ontem @ cor:azul");
  assert.equal(f.texto, "prazo:ontem @ cor:azul");
  assert.equal(temFiltro(f), false);
});

test("@pessoa acha pelo começo do nome, sobrenome ou usuário, sem acento", () => {
  assert.equal(cardPassa(card(), lerFiltros("@pacca"), hoje, pessoas), true);
  assert.equal(cardPassa(card(), lerFiltros("@bru"), hoje, pessoas), true);
  assert.equal(cardPassa(card(), lerFiltros("@lucia"), hoje, pessoas), false);
  assert.equal(
    cardPassa(card({ responsaveis: ["u2"] }), lerFiltros("@lucia"), hoje, pessoas),
    true,
  );
});

test("#etiqueta e area:", () => {
  assert.equal(cardPassa(card(), lerFiltros("#urg"), hoje, pessoas), true);
  assert.equal(cardPassa(card(), lerFiltros("#cliente"), hoje, pessoas), false);
  assert.equal(cardPassa(card(), lerFiltros("area:inpi"), hoje, pessoas), true);
  assert.equal(cardPassa(card(), lerFiltros("area:soc"), hoje, pessoas), false);
  assert.equal(
    cardPassa(
      card({ areaId: "societario", modulo: "Societário" }),
      lerFiltros("area:societario"),
      hoje,
      pessoas,
    ),
    true,
  );
});

test("prazo: vencido, hoje, semana e sem", () => {
  assert.equal(cardPassa(card(), lerFiltros("prazo:vencido"), hoje, pessoas), true);
  assert.equal(
    cardPassa(card({ prazo: "22/10/2026" }), lerFiltros("prazo:hoje"), hoje, pessoas),
    true,
  );
  assert.equal(
    cardPassa(card({ prazo: "28/10/2026" }), lerFiltros("prazo:semana"), hoje, pessoas),
    true,
  );
  assert.equal(
    cardPassa(card({ prazo: "30/10/2026" }), lerFiltros("prazo:semana"), hoje, pessoas),
    false,
  );
  assert.equal(cardPassa(card({ prazo: "" }), lerFiltros("prazo:sem"), hoje, pessoas), true);
  assert.equal(cardPassa(card(), lerFiltros("prazo:sem"), hoje, pessoas), false);
});

test("card encerrado não conta como atrasado", () => {
  assert.equal(
    cardPassa(card({ kanbanStatus: "Finalizado" }), lerFiltros("prazo:vencido"), hoje, pessoas),
    false,
  );
  assert.equal(
    cardPassa(card({ kanbanStatus: "Finalizado" }), lerFiltros("status:encerrado"), hoje, pessoas),
    true,
  );
  assert.equal(cardPassa(card(), lerFiltros("status:encerrado"), hoje, pessoas), false);
});

test("todos os operadores juntos precisam valer", () => {
  const f = lerFiltros("@bruno #urgente prazo:vencido area:inpi");
  assert.equal(cardPassa(card(), f, hoje, pessoas), true);
  assert.equal(cardPassa(card({ responsaveis: ["u2"] }), f, hoje, pessoas), false);
});
