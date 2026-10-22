// Roda com: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  abasDaFolha,
  combinarDataHora,
  duracaoSeg,
  erroNoIntervalo,
  formatarDuracao,
  formatarRelogio,
  horasDecimais,
  lerDuracao,
  totalizar,
  type Apontamento,
} from "./tempo.ts";

const ap = (extra: Partial<Apontamento>): Apontamento => ({
  id: Math.random().toString(36).slice(2),
  user_id: "u1",
  area_id: "societario",
  cliente_id: "c-soc",
  cliente_dir_id: "dir-acme",
  cliente_nome: "Acme",
  plano_id: "p1",
  plano_nome: "Demandas",
  item_id: "i1",
  item_nome: "Alteração contratual",
  subitem_id: null,
  subitem_nome: null,
  descricao: "",
  inicio: "2026-10-22T12:00:00.000Z",
  fim: "2026-10-22T13:30:00.000Z",
  ...extra,
});

test("duração: fechado e rodando", () => {
  assert.equal(duracaoSeg(ap({})), 5400);
  const agora = new Date("2026-10-22T12:10:00.000Z");
  assert.equal(duracaoSeg(ap({ fim: null }), agora), 600);
});

test("formatos de duração", () => {
  assert.equal(formatarDuracao(5400), "1h 30min");
  assert.equal(formatarDuracao(7200), "2h");
  assert.equal(formatarDuracao(2700), "45min");
  assert.equal(formatarDuracao(20), "menos de 1min");
  assert.equal(formatarDuracao(0), "0min");
  assert.equal(formatarRelogio(3723), "1:02:03");
  assert.equal(horasDecimais(5400), 1.5);
  assert.equal(horasDecimais(1000), 0.28);
});

test("lê duração do jeito que as pessoas escrevem", () => {
  const casos: [string, number | null][] = [
    ["1h30", 5400],
    ["1h 30min", 5400],
    ["1:30", 5400],
    ["90min", 5400],
    ["45m", 2700],
    ["1,5h", 5400],
    ["1.5", 5400],
    ["2h", 7200],
    ["2", 7200],
    ["90", 5400],
    ["0:15", 900],
    ["", null],
    ["muito", null],
  ];
  for (const [texto, esperado] of casos) assert.equal(lerDuracao(texto), esperado, texto);
});

test("intervalo lançado à mão", () => {
  const agora = new Date(2026, 9, 22, 18, 0);
  const ini = combinarDataHora("2026-10-22", "09:00");
  assert.deepEqual([ini?.getHours(), ini?.getMinutes(), ini?.getDate()], [9, 0, 22]);
  assert.equal(erroNoIntervalo(ini, combinarDataHora("2026-10-22", "10:30"), agora), null);
  assert.equal(
    erroNoIntervalo(ini, combinarDataHora("2026-10-22", "08:00"), agora),
    "O fim precisa ser depois do início.",
  );
  assert.equal(
    erroNoIntervalo(
      combinarDataHora("2026-10-23", "09:00"),
      combinarDataHora("2026-10-23", "10:00"),
      agora,
    ),
    "O início está no futuro.",
  );
  assert.equal(erroNoIntervalo(null, null, agora), "Informe o dia e a hora de início.");
});

test("totais: cliente junta as áreas, demanda separa as subdemandas", () => {
  const aps = [
    ap({ subitem_id: "k1", subitem_nome: "Minuta" }),
    ap({
      subitem_id: "k1",
      subitem_nome: "Minuta",
      inicio: "2026-10-23T12:00:00.000Z",
      fim: "2026-10-23T12:30:00.000Z",
    }),
    ap({ subitem_id: null, inicio: "2026-10-24T12:00:00.000Z", fim: "2026-10-24T13:00:00.000Z" }),
    // Mesmo cliente do diretório, outra área e outra demanda.
    ap({
      area_id: "inpi",
      cliente_id: "c-inpi",
      item_id: "i9",
      item_nome: "Registro de marca",
      inicio: "2026-10-22T15:00:00.000Z",
      fim: "2026-10-22T15:20:00.000Z",
    }),
    // Outro cliente.
    ap({ cliente_dir_id: "dir-beta", cliente_nome: "Beta", item_id: "i5", item_nome: "Parecer" }),
  ];
  const [acme, beta] = totalizar(aps);
  assert.equal(acme.nome, "Acme");
  assert.equal(acme.seg, 5400 + 1800 + 3600 + 1200);
  assert.deepEqual(
    acme.demandas.map((d) => [d.nome, d.seg]),
    [
      ["Alteração contratual", 10800],
      ["Registro de marca", 1200],
    ],
  );
  assert.deepEqual(
    acme.demandas[0].subdemandas.map((s) => [s.id, s.nome, s.seg]),
    [
      ["k1", "Minuta", 7200],
      [null, "", 3600],
    ],
  );
  assert.equal(beta.seg, 5400);
});

test("abas da planilha: lançamentos, por cliente e por demanda", () => {
  const aps = [
    ap({ subitem_id: "k1", subitem_nome: "Minuta", descricao: "Redação da minuta" }),
    ap({ inicio: "2026-10-23T12:00:00.000Z", fim: "2026-10-23T13:00:00.000Z" }),
  ];
  const abas = abasDaFolha(aps, { pessoa: () => "Bruno", area: (a) => a.toUpperCase() });
  assert.deepEqual(
    abas.map((a) => a.nome),
    ["Lançamentos", "Por cliente", "Por demanda"],
  );
  const [primeira] = abas[0].linhas;
  assert.ok(primeira[0] instanceof Date);
  assert.deepEqual(primeira.slice(3), [
    { duracaoSeg: 5400 },
    1.5,
    "Bruno",
    "Acme",
    "SOCIETARIO",
    "Demandas",
    "Alteração contratual",
    "Minuta",
    "Redação da minuta",
  ]);
  assert.deepEqual(abas[1].linhas, [["Acme", 1, { duracaoSeg: 9000 }, 2.5]]);
  assert.deepEqual(
    abas[2].linhas.map((l) => [l[2], l[3], l[5]]),
    [
      ["Alteração contratual", "(total da demanda)", 2.5],
      ["Alteração contratual", "Minuta", 1.5],
      ["Alteração contratual", "(direto na demanda)", 1],
    ],
  );
});
