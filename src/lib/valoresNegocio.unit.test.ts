// Roda com: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { diferenca, aplicar } from "./sincronizacao.ts";
import { lerValor, separarValores, sobreporValores } from "./valoresNegocio.ts";

// O formato aqui é o do JSON solto, de propósito: misturado como o de verdade.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const estado = (): any => ({
  areas: [
    {
      id: "comercial",
      clientes: [
        {
          id: "c1",
          planos: [{ id: "p1", items: [{ id: "n1", name: "Due diligence", valor: 8500 }] }],
        },
      ],
    },
    {
      id: "societario",
      clientes: [{ id: "c2", planos: [{ id: "p2", items: [{ id: "x", valor: 1 }] }] }],
    },
  ],
  produtos: [{ id: "pr", info: [{ id: "i", valor: "texto do produto" }] }],
});

test("mudar o valor de um negócio vai para a tabela, não para o JSON", () => {
  const antes = estado();
  const depois = structuredClone(antes);
  depois.areas[0].clientes[0].planos[0].items[0].valor = 12000;
  depois.areas[0].clientes[0].planos[0].items[0].name = "Due diligence ampliada";
  const r = separarValores(diferenca(antes, depois));
  assert.deepEqual(r.valores, [{ itemId: "n1", valor: 12000 }]);
  assert.equal(r.ops.length, 1);
  assert.deepEqual(r.ops[0].caminho.at(-1), "name");
});

test("negócio novo entra no JSON sem o valor, e o valor vai para a tabela", () => {
  const antes = estado();
  const depois = structuredClone(antes);
  depois.areas[0].clientes[0].planos[0].items.push({ id: "n2", name: "Novo", valor: 3000 });
  const r = separarValores(diferenca(antes, depois));
  assert.deepEqual(r.valores, [{ itemId: "n2", valor: 3000 }]);
  const gravado = aplicar(antes, r.ops);
  assert.deepEqual(gravado.areas[0].clientes[0].planos[0].items[1], { id: "n2", name: "Novo" });
});

test("cliente inteiro gravado de uma vez também perde os valores", () => {
  const antes = estado();
  const depois = structuredClone(antes);
  depois.areas[0].clientes.push({
    id: "c9",
    planos: [{ id: "p9", items: [{ id: "n9", name: "A", valor: "R$ 8.500,00" }] }],
  });
  const r = separarValores(diferenca(antes, depois));
  assert.deepEqual(r.valores, [{ itemId: "n9", valor: 8500 }]);
  assert.ok(!JSON.stringify(r.ops).includes("8.500"));
});

test("apagar o negócio apaga o valor; campos chamados valor fora do comercial ficam", () => {
  const antes = estado();
  const depois = structuredClone(antes);
  depois.areas[0].clientes[0].planos[0].items = [];
  depois.areas[1].clientes[0].planos[0].items[0].valor = 2;
  depois.produtos[0].info[0].valor = "outro texto";
  const r = separarValores(diferenca(antes, depois));
  assert.deepEqual(r.valores, [{ itemId: "n1", valor: null }]);
  assert.equal(r.ops.length, 3);
});

test("sobrepor põe o valor da tabela e não toca no resto", () => {
  const e = estado();
  const v = sobreporValores(e, new Map([["n1", 9000]]));
  assert.equal(v.areas[0].clientes[0].planos[0].items[0].valor, 9000);
  assert.equal(v.areas[1], e.areas[1]);
  assert.equal(v.produtos, e.produtos);
  assert.equal(sobreporValores(e, new Map()), e);
});

test("lerValor entende o jeito brasileiro de escrever", () => {
  assert.equal(lerValor("8.500"), 8500);
  assert.equal(lerValor("R$ 8.500,00"), 8500);
  assert.equal(lerValor("8,5k"), 8500);
  assert.equal(lerValor("12 mil"), 12000);
  assert.equal(lerValor(""), 0);
});
