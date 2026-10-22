// Roda com: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { gerarIcs, gradeDoMes, porDia, somarMes } from "./calendario.ts";

test("a grade do mês tem seis semanas e começa na segunda", () => {
  // Outubro de 2026 começa numa quinta.
  const g = gradeDoMes(2026, 10);
  assert.equal(g.length, 42);
  assert.deepEqual(g[0], { dia: "2026-09-28", doMes: false });
  assert.deepEqual(g[3], { dia: "2026-10-01", doMes: true });
  assert.equal(g.filter((d) => d.doMes).length, 31);
});

test("mês que começa na segunda não ganha semana vazia antes", () => {
  // Junho de 2026 começa numa segunda.
  assert.deepEqual(gradeDoMes(2026, 6)[0], { dia: "2026-06-01", doMes: true });
});

test("somar mês atravessa o ano", () => {
  assert.deepEqual(somarMes(2026, 12, 1), { ano: 2027, mes: 1 });
  assert.deepEqual(somarMes(2026, 1, -1), { ano: 2025, mes: 12 });
});

test("agrupa pelo dia do prazo, nos dois formatos", () => {
  const m = porDia([
    { id: "a", prazo: "22/10/2026" },
    { id: "b", prazo: "2026-10-22T15:00:00.000Z" },
    { id: "c", prazo: "" },
  ]);
  assert.deepEqual(
    m.get("2026-10-22")?.map((x) => x.id),
    ["a", "b"],
  );
  assert.equal(m.size, 1);
});

test("ics: dia inteiro, com hora, e texto escapado", () => {
  const ics = gerarIcs(
    [
      { uid: "i1", titulo: "Protocolo; INPI, marca X", prazo: "22/10/2026" },
      { uid: "i2", titulo: "Audiência", prazo: "23/10/2026 14:30", descricao: "Linha 1\nLinha 2" },
      { uid: "i3", titulo: "Sem data", prazo: "" },
    ],
    new Date("2026-10-21T12:00:00Z"),
  );
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20261022\r\nDTEND;VALUE=DATE:20261023"));
  assert.ok(ics.includes("SUMMARY:Protocolo\\; INPI\\, marca X"));
  assert.ok(ics.includes("DTSTART;TZID=America/Sao_Paulo:20261023T143000"));
  assert.ok(ics.includes("DTEND;TZID=America/Sao_Paulo:20261023T153000"));
  assert.ok(ics.includes("DESCRIPTION:Linha 1\\nLinha 2"));
  assert.ok(ics.includes("DTSTAMP:20261021T120000Z"));
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 2);
});

test("ics: linha longa é dobrada em 75 octetos", () => {
  const ics = gerarIcs([{ uid: "x", titulo: "ç".repeat(60), prazo: "22/10/2026" }]);
  for (const linha of ics.split("\r\n")) {
    assert.ok(new TextEncoder().encode(linha).length <= 75, linha);
  }
});
