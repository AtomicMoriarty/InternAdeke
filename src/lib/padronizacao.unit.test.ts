// Roda com: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apagarCliente,
  aplicarNomes,
  clientesParecidos,
  demandasDoCliente,
  demandasRepetidas,
  marcarMesmoGrupo,
  nomePadronizado,
  propostasDeNome,
  unirClientes,
} from "./padronizacao.ts";
import type { DashboardState } from "./dashboardTypes";

test("nomes de demanda: maiúscula nas palavras, siglas e números mantidos", () => {
  const casos: [string, string][] = [
    ["REVISÃO DA POLÍTICA DE PLDFT", "Revisão da Política de PLDFT"],
    ["REPRESENTAÇÃO NA OAB-RJ", "Representação na OAB-RJ"],
    ["2ª ALTERAÇÃO CS", "2ª Alteração CS"],
    // "ADV" tem vogal: vira abreviação comum, "Adv".
    ["CONTRATO PARCERIA FELIX ADV", "Contrato Parceria Felix Adv"],
    ["INPI - MONITORAMENTO DE REGISTROS DE MARCAS", "INPI - Monitoramento de Registros de Marcas"],
    ["NOTIFICAÇÃO RESCISÃO PROTOTYPE/TRAAL", "Notificação Rescisão Prototype/Traal"],
    ["ADITIVO TRANSPORTES MSF", "Aditivo Transportes MSF"],
    ["  ALVARÁ   ", "Alvará"],
  ];
  for (const [antes, depois] of casos) assert.equal(nomePadronizado(antes), depois, antes);
});

test("nome escrito com minúsculas é respeitado", () => {
  assert.equal(nomePadronizado("Contrato | CAP Clube e Via Cap"), "Contrato | CAP Clube e Via Cap");
  assert.equal(nomePadronizado("i9DC"), "i9DC");
  assert.equal(nomePadronizado("Elaboração  10° Aditivo FM"), "Elaboração 10° Aditivo FM");
});

test("nomes de cliente: marcas curtas e siglas ficam", () => {
  const casos: [string, string][] = [
    ["INCRÍVEL", "Incrível"],
    ["CASA DE SAÚDE GABINAL", "Casa de Saúde Gabinal"],
    ["PLANIUM SERVIÇOS FINANCEIROS", "Planium Serviços Financeiros"],
    ["MODO", "MODO"],
    ["OLRA", "OLRA"],
    ["V2X PAY", "V2X Pay"],
    ["PEDE.AI", "Pede.ai"],
    ["LEVE.AÍ", "Leve.aí"],
    ["IVY E IRMAOS S.A", "Ivy e Irmaos S.A"],
    ["HBI", "HBI"],
    ["W3M", "W3M"],
  ];
  for (const [antes, depois] of casos)
    assert.equal(nomePadronizado(antes, { cliente: true }), depois, antes);
});

const base = (): DashboardState => ({
  clientes: [
    { id: "d1", nome: "GIOVAN FUSIEGER", documento: "" },
    { id: "d2", nome: "GIOVAM", documento: "123", tags: ["X"] },
    { id: "d3", nome: "OASIS" },
    { id: "d4", nome: "OASIS HUB" },
    { id: "d5", nome: "ORLA INVESTIMENTOS" },
  ],
  areas: [
    {
      id: "societario",
      clientes: [
        {
          id: "v1",
          clienteId: "d1",
          name: "GIOVAN FUSIEGER",
          responsaveis: ["ana"],
          planos: [{ id: "p1", name: "Demandas", items: [{ id: "i1", name: "CONTRATO SOCIAL" }] }],
        },
        {
          id: "v2",
          clienteId: "d2",
          name: "GIOVAM",
          responsaveis: ["bruno"],
          planos: [
            {
              id: "p2",
              name: "Demandas",
              items: [
                { id: "i2", name: "ALTERAÇÃO" },
                { id: "i3", name: "CONTRATO SOCIAL" },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "inpi",
      clientes: [
        {
          id: "v3",
          clienteId: "d2",
          name: "GIOVAM",
          planos: [{ id: "p3", name: "Demandas", items: [{ id: "i4", name: "Marca" }] }],
        },
      ],
    },
  ],
});

test("unir clientes: demandas passam para quem fica, nome vira apelido, dados aproveitados", () => {
  const d = unirClientes(base(), "d1", "d2");
  const soc = d.areas![0].clientes!;
  assert.equal(soc.length, 1);
  assert.deepEqual(
    soc[0].planos![0].items!.map((i) => i.id),
    ["i1", "i2", "i3"],
  );
  assert.deepEqual(soc[0].responsaveis, ["ana", "bruno"]);
  // Na área em que só o absorvido estava, o vínculo passa a apontar para quem fica.
  const inpi = d.areas![1].clientes![0];
  assert.equal(inpi.clienteId, "d1");
  assert.equal(inpi.name, "GIOVAN FUSIEGER");
  const fica = (
    d.clientes as { id: string; apelidos?: string[]; documento?: string; tags?: string[] }[]
  ).find((c) => c.id === "d1")!;
  assert.deepEqual(fica.apelidos, ["GIOVAM"]);
  assert.equal(fica.documento, "123");
  assert.deepEqual(fica.tags, ["X"]);
  assert.equal((d.clientes as unknown[]).length, 4);
  assert.equal(demandasDoCliente(d, "d1"), 4);
});

test("parecidos: mesma primeira palavra, uma letra trocada; não repete par já respondido", () => {
  const pares = clientesParecidos(base()).map((p) => [p.a.nome, p.b.nome].sort().join(" × "));
  assert.ok(pares.includes("GIOVAM × GIOVAN FUSIEGER"));
  assert.ok(pares.includes("OASIS × OASIS HUB"));
  const marcado = marcarMesmoGrupo(base(), "d3", "d4", "Oasis");
  assert.ok(!clientesParecidos(marcado).some((p) => p.a.id === "d3" || p.b.id === "d3"));
  assert.ok(
    ((marcado.clientes as { id: string; tags?: string[] }[])[2].tags || []).includes("Grupo Oasis"),
  );
});

test("demandas repetidas no mesmo cliente, somando as áreas", () => {
  const unido = unirClientes(base(), "d1", "d2");
  const rep = demandasRepetidas(unido);
  assert.equal(rep.length, 1);
  assert.deepEqual(
    rep[0].itens.map((o) => o.item.id),
    ["i1", "i3"],
  );
});

test("propostas de nome e aplicação, com o nome do vínculo acompanhando", () => {
  const props = propostasDeNome(base());
  assert.ok(props.some((p) => p.tipo === "cliente" && p.depois === "Giovan Fusieger"));
  assert.ok(props.some((p) => p.tipo === "demanda" && p.depois === "Contrato Social"));
  const d = aplicarNomes(base(), props);
  assert.equal(d.areas![0].clientes![0].name, "Giovan Fusieger");
  assert.equal(d.areas![0].clientes![0].planos![0].items![0].name, "Contrato Social");
  assert.equal(d.areas![1].clientes![0].planos![0].items![0].name, "Marca");
});

test("apagar cliente tira de todas as áreas e do diretório", () => {
  const d = apagarCliente(base(), "d2");
  assert.equal(d.areas![1].clientes!.length, 0);
  assert.equal(d.areas![0].clientes!.length, 1);
  assert.ok(!(d.clientes as { id: string }[]).some((c) => c.id === "d2"));
});
