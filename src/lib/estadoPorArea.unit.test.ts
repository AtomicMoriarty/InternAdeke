// Roda com: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicar, diferenca, type Operacao } from "./sincronizacao.ts";
import {
  LINHA_COMUM,
  LINHA_PRODUTOS,
  dividirEstado,
  linhasDoLote,
  montarEstado,
  moduloDaLinha,
  rotear,
  type LinhaArea,
} from "./estadoPorArea.ts";

const base = () => ({
  areas: [
    {
      id: "compliance",
      clientes: [
        {
          id: "c1",
          name: "Acme",
          planos: [{ id: "p1", name: "Programa", items: [{ id: "i1", name: "Política" }] }],
        },
      ],
    },
    {
      id: "inpi",
      clientes: [
        {
          id: "c2",
          name: "Beta",
          planos: [{ id: "p2", name: "Marcas", items: [{ id: "i2", name: "Registro" }] }],
        },
      ],
    },
  ],
  produtos: [{ id: "pr1", name: "App", items: [{ id: "i9", name: "Login" }] }],
  templates: [{ id: "t1", name: "Padrão" }],
  clientes: [{ id: "c1", name: "Acme" }],
  updates: [],
});

/** Aplica as operações linha por linha, como o banco fará, e monta de volta. */
function aplicarPorLinha(linhas: LinhaArea[], ops: Operacao[]): LinhaArea[] {
  const porId = new Map(linhas.map((l) => [l.id, { ...l }]));
  for (const op of ops) {
    for (const r of rotear(op)) {
      const atual = porId.get(r.linha) ?? { id: r.linha, ordem: porId.size, data: {} };
      porId.set(r.linha, { ...atual, data: aplicar(atual.data, [r.op]) });
    }
  }
  return [...porId.values()];
}

/** Toda edição precisa dar o mesmo resultado no JSON único e nas linhas. */
function confere(editar: (d: ReturnType<typeof base>) => void) {
  const antes = base();
  const depois = structuredClone(antes);
  editar(depois);
  const ops = diferenca(antes, depois);
  assert.ok(ops.length > 0, "a edição precisa gerar operações");
  const linhas = aplicarPorLinha(dividirEstado(antes), ops);
  assert.deepEqual(montarEstado(linhas), aplicar(antes, ops));
}

test("dividir e montar de volta dá o mesmo estado", () => {
  const d = base();
  assert.deepEqual(montarEstado(dividirEstado(d)), d);
});

test("as linhas: uma por área, produtos e comum", () => {
  const ids = dividirEstado(base()).map((l) => l.id);
  assert.deepEqual(ids, ["compliance", "inpi", LINHA_PRODUTOS, LINHA_COMUM]);
});

test("editar um card cai só na linha da área dele", () => {
  const antes = base();
  const depois = structuredClone(antes);
  depois.areas[1].clientes[0].planos[0].items[0].name = "Registro de marca";
  const ops = diferenca(antes, depois);
  assert.deepEqual([...linhasDoLote(ops)], ["inpi"]);
  assert.deepEqual(rotear(ops[0]), [
    {
      linha: "inpi",
      op: {
        op: "set",
        caminho: ["clientes", { id: "c2" }, "planos", { id: "p2" }, "items", { id: "i2" }, "name"],
        valor: "Registro de marca",
      },
    },
  ]);
});

test("editar, criar, apagar e reordenar dão o mesmo nas linhas e no JSON", () => {
  confere((d) => {
    d.areas[0].clientes[0].planos[0].items[0].name = "Política de integridade";
  });
  confere((d) => {
    d.areas[0].clientes[0].planos[0].items.push({ id: "i3", name: "Canal de denúncia" });
  });
  confere((d) => {
    d.areas[1].clientes[0].planos[0].items = [];
  });
  confere((d) => {
    d.areas[0].clientes[0].planos[0].items.unshift({ id: "i0", name: "Antes de tudo" });
  });
  confere((d) => {
    d.produtos[0].items[0].name = "Login social";
  });
  confere((d) => {
    d.templates.push({ id: "t2", name: "INPI" });
    d.clientes[0].name = "Acme S.A.";
  });
});

test("mover um card entre áreas toca as duas linhas", () => {
  const antes = base();
  const depois = structuredClone(antes);
  const [card] = depois.areas[0].clientes[0].planos[0].items.splice(0, 1);
  depois.areas[1].clientes[0].planos[0].items.push(card);
  const ops = diferenca(antes, depois);
  assert.deepEqual([...linhasDoLote(ops)].sort(), ["compliance", "inpi"]);
  confere((d) => {
    const [c] = d.areas[0].clientes[0].planos[0].items.splice(0, 1);
    d.areas[1].clientes[0].planos[0].items.push(c);
  });
});

test("área nova vira linha nova", () => {
  const ops: Operacao[] = [
    {
      op: "set",
      caminho: ["areas", { id: "contratos" }],
      valor: { id: "contratos", clientes: [] },
    },
  ];
  assert.deepEqual(rotear(ops[0]), [
    {
      linha: "contratos",
      op: { op: "set", caminho: [], valor: { id: "contratos", clientes: [] } },
    },
  ]);
});

test("apagar ou reordenar as áreas não vira nada", () => {
  assert.deepEqual(rotear({ op: "remove", caminho: ["areas", { id: "inpi" }] }), []);
  assert.deepEqual(rotear({ op: "ordem", caminho: ["areas"], ids: ["inpi", "compliance"] }), []);
});

test("quem não vê uma área recebe o estado sem ela, e o resto funciona", () => {
  const linhas = dividirEstado(base()).filter((l) => l.id !== "inpi" && l.id !== LINHA_PRODUTOS);
  const visto = montarEstado(linhas);
  assert.deepEqual(
    visto.areas?.map((a) => a.id),
    ["compliance"],
  );
  assert.deepEqual(visto.produtos, []);
  assert.equal((visto.templates as unknown[]).length, 1);
});

test("o módulo de permissão de cada linha", () => {
  assert.equal(moduloDaLinha(LINHA_COMUM), null);
  assert.equal(moduloDaLinha(LINHA_PRODUTOS), "produtos");
  assert.equal(moduloDaLinha("lgpd"), "lgpd");
});
