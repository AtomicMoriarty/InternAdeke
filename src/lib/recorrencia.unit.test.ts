// Roda com: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { gerarRecorrencias, proximoPrazo, somarPeriodo } from "./recorrencia.ts";
import type { DashboardState, Item } from "./dashboardTypes";

// 2026-10-22 10h em Brasília.
const agora = new Date("2026-10-22T13:00:00Z");

let seq = 0;
const novoId = () => `n${++seq}`;

const estado = (areaId: string, items: Item[]): DashboardState => ({
  areas: [
    {
      id: areaId,
      clientes: [{ id: "c1", name: "Acme", planos: [{ id: "p1", name: "Rotina", items }] }],
    },
  ],
});

test("somar período: semana, mês com dia 31, ano bissexto", () => {
  assert.equal(somarPeriodo("2026-10-22", "semanal"), "2026-10-29");
  assert.equal(somarPeriodo("2026-01-31", "mensal"), "2026-02-28");
  assert.equal(somarPeriodo("2026-11-30", "trimestral"), "2027-02-28");
  assert.equal(somarPeriodo("2028-02-29", "anual"), "2029-02-28");
  assert.equal(somarPeriodo("2026-12-15", "mensal"), "2027-01-15");
});

test("próximo prazo parte do prazo anterior e mantém a hora", () => {
  assert.equal(proximoPrazo("10/11/2026 14:00", "mensal", "2026-10-22"), "10/12/2026 14:00");
});

test("próximo prazo nunca nasce no passado", () => {
  // Prazo de janeiro, card finalizado só em outubro: pula para a frente.
  assert.equal(proximoPrazo("15/01/2026", "mensal", "2026-10-22"), "15/11/2026");
  // Sem prazo: parte de hoje.
  assert.equal(proximoPrazo("", "semanal", "2026-10-22"), "29/10/2026");
});

test("card finalizado com repetição gera o próximo, zerado, logo depois dele", () => {
  seq = 0;
  const data = estado("compliance", [
    {
      id: "i1",
      name: "Relatório mensal",
      kanbanStatus: "Finalizado",
      prazo: "20/10/2026",
      recorrencia: "mensal",
      responsaveis: ["u1"],
      checklist: [{ id: "k1", text: "Levantar dados", done: true }],
      comentarios: [{ id: "x", text: "feito", autor_id: "u1", autor_nome: "U" }],
    },
    { id: "i2", name: "Outro", kanbanStatus: "Em Andamento" },
  ]);
  const r = gerarRecorrencias(data, agora, novoId);
  assert.equal(r.criados, 1);
  const items = r.data.areas![0].clientes![0].planos![0].items!;
  assert.deepEqual(
    items.map((i) => i.id),
    ["i1", "n1", "i2"],
  );
  assert.equal(items[0].recorrenciaProxima, "n1");
  const novo = items[1];
  assert.equal(novo.name, "Relatório mensal");
  assert.equal(novo.kanbanStatus, "A Fazer");
  assert.equal(novo.prazo, "20/11/2026");
  assert.equal(novo.recorrencia, "mensal");
  assert.equal(novo.recorrenciaAnterior, "i1");
  assert.deepEqual(novo.responsaveis, ["u1"]);
  assert.equal(novo.checklist![0].done, false);
  assert.notEqual(novo.checklist![0].id, "k1");
  assert.equal(novo.comentarios, undefined);
});

test("rodar de novo não duplica", () => {
  seq = 0;
  const primeira = gerarRecorrencias(
    estado("compliance", [
      { id: "i1", name: "x", kanbanStatus: "Finalizado", recorrencia: "semanal" },
    ]),
    agora,
    novoId,
  );
  const segunda = gerarRecorrencias(primeira.data, agora, novoId);
  assert.equal(segunda.criados, 0);
  assert.equal(segunda.data, primeira.data);
});

test("aberto, suspenso ou sem repetição não gera nada", () => {
  const data = estado("compliance", [
    { id: "a", name: "a", kanbanStatus: "Em Andamento", recorrencia: "mensal" },
    { id: "b", name: "b", kanbanStatus: "Suspenso", recorrencia: "mensal" },
    { id: "c", name: "c", kanbanStatus: "Finalizado" },
    { id: "d", name: "d", kanbanStatus: "Finalizado", recorrencia: "quinzenal" },
  ]);
  const r = gerarRecorrencias(data, agora, novoId);
  assert.equal(r.criados, 0);
  assert.equal(r.data, data);
});

test("no INPI, etapa que não encerra o processo não gera o próximo", () => {
  seq = 0;
  const r = gerarRecorrencias(
    estado("inpi", [
      { id: "i1", name: "Renovação", kanbanStatus: "Concedida", recorrencia: "anual" },
    ]),
    agora,
    novoId,
  );
  // "Concedida" equivale a Monitoramento, não a Finalizado: não gera.
  assert.equal(r.criados, 0);
});

test("produtos também repetem", () => {
  seq = 0;
  const r = gerarRecorrencias(
    {
      produtos: [
        {
          id: "pr1",
          name: "App",
          items: [{ id: "i1", name: "Release", kanbanStatus: "Finalizado", recorrencia: "mensal" }],
        },
      ],
    },
    agora,
    novoId,
  );
  assert.equal(r.criados, 1);
  assert.equal(r.data.produtos![0].items!.length, 2);
});
