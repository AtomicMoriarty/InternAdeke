// Roda com: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avisosDePrazo,
  chaveAviso,
  diaNoEscritorio,
  lerPrazo,
  prazoEncerrado,
  textoDoAviso,
} from "./prazos.ts";
import type { DashboardState, Item } from "./dashboardTypes";

const modulo = (id: string) => id.toUpperCase();

// 2026-10-22 13:00 UTC = 10h em Brasília.
const agora = new Date("2026-10-22T13:00:00Z");

const estado = (items: Item[]): DashboardState => ({
  areas: [
    {
      id: "inpi",
      clientes: [{ id: "c1", name: "Acme", planos: [{ id: "p1", name: "Marcas", items }] }],
    },
  ],
});

test("o dia é contado em Brasília, não em UTC", () => {
  // 02h UTC do dia 23 ainda é dia 22 em Brasília.
  assert.equal(diaNoEscritorio(new Date("2026-10-23T02:00:00Z")), "2026-10-22");
});

test("lê os dois formatos de prazo que existem no estado", () => {
  assert.deepEqual(lerPrazo("31/12/2026"), { dia: "2026-12-31", hora: null });
  assert.deepEqual(lerPrazo("31/12/2026 14:30"), { dia: "2026-12-31", hora: "14:30" });
  assert.deepEqual(lerPrazo("2026-12-31"), { dia: "2026-12-31", hora: null });
  // Instante em UTC, como o Trello exporta: vale o dia e a hora de Brasília.
  assert.deepEqual(lerPrazo("2026-12-31T15:00:00.000Z"), { dia: "2026-12-31", hora: "12:00" });
  assert.deepEqual(lerPrazo("2027-01-01T01:00:00.000Z"), { dia: "2026-12-31", hora: "22:00" });
  assert.deepEqual(lerPrazo("2026-12-31T09:00"), { dia: "2026-12-31", hora: "09:00" });
  assert.equal(lerPrazo(""), null);
  assert.equal(lerPrazo("amanhã"), null);
});

test("card finalizado, suspenso ou com etapa encerrada não é cobrado", () => {
  assert.equal(prazoEncerrado({ id: "a", name: "a", kanbanStatus: "Finalizado" }), true);
  assert.equal(prazoEncerrado({ id: "a", name: "a", kanbanStatus: "Suspenso" }), true);
  assert.equal(prazoEncerrado({ id: "a", name: "a", status: "Concluído" }), true);
  assert.equal(prazoEncerrado({ id: "a", name: "a", kanbanStatus: "Em Andamento" }), false);
  assert.equal(prazoEncerrado({ id: "a", name: "a" }), false);
});

test("avisa só dentro da antecedência, para cada responsável, uma vez", () => {
  const data = estado([
    { id: "i1", name: "Vence em 2", prazo: "24/10/2026", responsaveis: ["u1", "u2", "u1"] },
    { id: "i2", name: "Vence em 10", prazo: "01/11/2026", responsaveis: ["u1"] },
    { id: "i3", name: "Sem dono", prazo: "22/10/2026", responsaveis: [] },
    {
      id: "i4",
      name: "Acabou",
      prazo: "20/10/2026",
      kanbanStatus: "Finalizado",
      responsaveis: ["u1"],
    },
    {
      id: "i5",
      name: "Aviso longo",
      prazo: "01/11/2026",
      avisoPrazoDias: 15,
      responsaveis: ["u3"],
    },
  ]);
  const avisos = avisosDePrazo(data, agora, new Set(), modulo);
  assert.deepEqual(
    avisos.map((a) => [a.user_id, a.item_id, a.trecho]),
    [
      ["u1", "i1", "Vencendo em 2 dias"],
      ["u2", "i1", "Vencendo em 2 dias"],
      ["u3", "i5", "Vencendo em 10 dias"],
    ],
  );
  assert.equal(avisos[0].modulo, "INPI");
  assert.equal(avisos[0].autor_nome, "sistema");
});

test("rodar duas vezes no mesmo dia não repete o aviso", () => {
  const data = estado([{ id: "i1", name: "x", prazo: "22/10/2026", responsaveis: ["u1"] }]);
  const ja = new Set([chaveAviso("u1", "i1")]);
  assert.deepEqual(avisosDePrazo(data, agora, ja, modulo), []);
});

test("prazo vencido continua sendo cobrado enquanto o card estiver aberto", () => {
  const data = estado([{ id: "i1", name: "x", prazo: "20/10/2026", responsaveis: ["u1"] }]);
  assert.equal(avisosDePrazo(data, agora, new Set(), modulo)[0].trecho, "Prazo vencido há 2 dias");
});

test("produtos também entram", () => {
  const data = {
    produtos: [
      {
        id: "pr1",
        name: "App",
        items: [{ id: "i9", name: "x", prazo: "23/10/2026", responsaveis: ["u1"] }],
      },
    ],
  };
  const [aviso] = avisosDePrazo(data, agora, new Set(), modulo);
  assert.equal(aviso.modulo, "Produtos");
  assert.equal(aviso.cliente_id, "pr1");
});

test("texto do aviso", () => {
  assert.equal(textoDoAviso(0, "14:30"), "Prazo hoje às 14:30");
  assert.equal(textoDoAviso(0, null), "Prazo hoje");
  assert.equal(textoDoAviso(1, null), "Vencendo em 1 dia");
  assert.equal(textoDoAviso(-1, null), "Prazo vencido há 1 dia");
});
