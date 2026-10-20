// Roda com: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicar, diferenca, iguais, type Operacao } from "./sincronizacao.ts";

const base = () => ({
  areas: [
    {
      id: "soc",
      clientes: [
        {
          id: "c1",
          name: "Acme",
          planos: [
            {
              id: "p1",
              name: "Demandas",
              items: [
                { id: "i1", name: "Contrato social", comentarios: [] },
                { id: "i2", name: "Alteração", checklist: [{ id: "k1", text: "a", done: false }] },
              ],
            },
          ],
        },
      ],
    },
  ],
  templates: ["x", "y"],
});

test("editar um campo vira uma operação só, apontada pelo id", () => {
  const antes = base();
  const depois = structuredClone(antes);
  depois.areas[0].clientes[0].planos[0].items[1].name = "Alteração contratual";
  const ops = diferenca(antes, depois);
  assert.deepEqual(ops, [
    {
      op: "set",
      caminho: [
        "areas",
        { id: "soc" },
        "clientes",
        { id: "c1" },
        "planos",
        { id: "p1" },
        "items",
        { id: "i2" },
        "name",
      ],
      valor: "Alteração contratual",
    },
  ]);
  assert.deepEqual(aplicar(antes, ops), depois);
});

test("duas pessoas editando cards diferentes: as duas edições ficam", () => {
  const servidor = base();
  const ana = structuredClone(servidor);
  ana.areas[0].clientes[0].planos[0].items[0].name = "Ana mexeu";
  const bruno = structuredClone(servidor);
  bruno.areas[0].clientes[0].planos[0].items[1].name = "Bruno mexeu";

  const final = aplicar(aplicar(servidor, diferenca(servidor, bruno)), diferenca(servidor, ana));
  const itens = final.areas[0].clientes[0].planos[0].items;
  assert.equal(itens[0].name, "Ana mexeu");
  assert.equal(itens[1].name, "Bruno mexeu");
});

test("edição cai no card certo mesmo se outro card entrou antes dele", () => {
  const servidor = base();
  const minha = structuredClone(servidor);
  minha.areas[0].clientes[0].planos[0].items[1].name = "editado";
  const ops = diferenca(servidor, minha);

  const outro = structuredClone(servidor);
  outro.areas[0].clientes[0].planos[0].items.unshift({ id: "novo", name: "Novo", comentarios: [] });

  const final = aplicar(outro, ops);
  const itens = final.areas[0].clientes[0].planos[0].items;
  assert.deepEqual(
    itens.map((i) => [i.id, i.name]),
    [
      ["novo", "Novo"],
      ["i1", "Contrato social"],
      ["i2", "editado"],
    ],
  );
});

test("card novo entra no fim, e arrastar vira uma operação de ordem", () => {
  const antes = base();
  const depois = structuredClone(antes);
  const itens = depois.areas[0].clientes[0].planos[0].items;
  itens.unshift({ id: "i3", name: "Primeiro", comentarios: [] });
  const ops = diferenca(antes, depois);
  assert.deepEqual(
    ops.map((o) => o.op),
    ["set", "ordem"],
  );
  assert.deepEqual(aplicar(antes, ops), depois);
});

test("apagar e reaplicar é inofensivo, e caminho que sumiu é ignorado", () => {
  const antes = base();
  const depois = structuredClone(antes);
  depois.areas[0].clientes[0].planos[0].items.splice(0, 1);
  const ops = diferenca(antes, depois);
  const uma = aplicar(antes, ops);
  assert.deepEqual(aplicar(uma, ops), uma);

  const editarApagado: Operacao[] = [
    {
      op: "set",
      caminho: [
        "areas",
        { id: "soc" },
        "clientes",
        { id: "c1" },
        "planos",
        { id: "p1" },
        "items",
        { id: "i1" },
        "name",
      ],
      valor: "x",
    },
  ];
  assert.equal(aplicar(uma, editarApagado), uma);
});

test("lista sem id é regravada inteira, e chave com undefined conta como ausente", () => {
  const antes = base();
  const depois = { ...structuredClone(antes), templates: ["x", "z"], vazio: undefined };
  const ops = diferenca(antes, depois);
  assert.deepEqual(ops, [{ op: "set", caminho: ["templates"], valor: ["x", "z"] }]);
  assert.ok(iguais(aplicar(antes, ops), depois));
});

test("operações sobre o mesmo estado aplicadas duas vezes dão o mesmo resultado", () => {
  const antes = base();
  const depois = structuredClone(antes);
  const item = depois.areas[0].clientes[0].planos[0].items[1];
  item.checklist![0].done = true;
  item.checklist!.push({ id: "k2", text: "b", done: false });
  delete (item as Record<string, unknown>).name;
  const ops = diferenca(antes, depois);
  const uma = aplicar(antes, ops);
  assert.deepEqual(uma, depois);
  assert.deepEqual(aplicar(uma, ops), depois);
});

test("nada mudou, nenhuma operação, e o mesmo objeto volta", () => {
  const antes = base();
  assert.deepEqual(diferenca(antes, structuredClone(antes)), []);
  assert.equal(aplicar(antes, []), antes);
});
