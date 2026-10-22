// Roda com: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { crc32, gerarXlsx, serialExcel } from "./planilha.ts";

test("crc32 do vetor de referência", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("número de série do Excel pelo relógio de parede", () => {
  assert.equal(serialExcel(new Date(2026, 0, 1)), 46023);
  assert.equal(serialExcel(new Date(2026, 0, 1, 12, 0)), 46023.5);
});

test("gera um zip com as partes do xlsx", () => {
  const bytes = gerarXlsx([
    {
      nome: "Lançamentos",
      colunas: [
        { titulo: "Data", formato: "data" },
        { titulo: "Duração", formato: "duracao" },
        { titulo: "Descrição", largura: 40 },
        { titulo: "Horas", formato: "numero" },
      ],
      linhas: [
        [new Date(2026, 9, 22), { duracaoSeg: 5400 }, 'Reunião <cliente> & "ata"', 1.5],
        [null, { duracaoSeg: 60 }, "", 0.02],
      ],
    },
    { nome: "Por cliente: total", colunas: [{ titulo: "Cliente" }], linhas: [["Acme"]] },
  ]);
  // Assinatura de zip e o diretório central no fim.
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const texto = new TextDecoder().decode(bytes);
  for (const parte of [
    "[Content_Types].xml",
    "xl/workbook.xml",
    "xl/styles.xml",
    "xl/worksheets/sheet1.xml",
    "xl/worksheets/sheet2.xml",
  ]) {
    assert.ok(texto.includes(parte), parte);
  }
  // Texto escapado, duração como fração de dia, nome de aba sem ":".
  assert.ok(texto.includes("Reunião &lt;cliente&gt; &amp; &quot;ata&quot;"));
  assert.ok(texto.includes(`<v>${5400 / 86400}</v>`));
  assert.ok(texto.includes('name="Por cliente- total"'));
  // Para conferência manual fora do teste (Excel, LibreOffice).
  if (process.env.SALVAR_XLSX) writeFileSync(process.env.SALVAR_XLSX, bytes);
});
