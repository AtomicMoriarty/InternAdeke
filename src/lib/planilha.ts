// Planilha .xlsx de verdade, sem biblioteca.
//
// O CSV que os relatórios já exportam serve para despejar dados, mas perde o
// que importa numa folha de horas: data que o Excel entende como data, duração
// que soma (12:30 + 15:45 = 28:15, não "texto"), mais de uma aba e cabeçalho
// congelado com filtro. Um .xlsx é um zip com alguns XML dentro; este arquivo
// monta esse zip sem compressão, o que o Excel, o Google Planilhas e o
// LibreOffice abrem normalmente.
//
// Fica sem imports com "@/" para rodar direto no node --test.

export type Celula = string | number | Date | null | undefined | { duracaoSeg: number };

export type Coluna = {
  titulo: string;
  /** Largura em caracteres. */
  largura?: number;
  /** Como mostrar: data (dd/mm/aaaa), hora (hh:mm), dataHora, duracao ([h]:mm) ou numero (0,00). */
  formato?: "texto" | "data" | "hora" | "dataHora" | "duracao" | "numero";
};

export type Aba = { nome: string; colunas: Coluna[]; linhas: Celula[][] };

// ─── zip (método "store") ────────────────────────────────────────────────────

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipar(arquivos: { nome: string; dados: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let deslocamento = 0;

  for (const arq of arquivos) {
    const nome = enc.encode(arq.nome);
    const crc = crc32(arq.dados);
    const tam = arq.dados.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // versão
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // sem compressão
    local.setUint32(14, crc, true);
    local.setUint32(18, tam, true);
    local.setUint32(22, tam, true);
    local.setUint16(26, nome.length, true);
    partes.push(new Uint8Array(local.buffer), nome, arq.dados);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, tam, true);
    dir.setUint32(24, tam, true);
    dir.setUint16(28, nome.length, true);
    dir.setUint32(42, deslocamento, true);
    central.push(new Uint8Array(dir.buffer), nome);

    deslocamento += 30 + nome.length + tam;
  }

  const tamanhoCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, deslocamento, true);

  const todas = [...partes, ...central, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(todas.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of todas) {
    saida.set(p, pos);
    pos += p.length;
  }
  return saida;
}

// ─── XML da planilha ─────────────────────────────────────────────────────────

function xml(s: string) {
  return (
    String(s)
      // Caracteres de controle não são válidos em XML 1.0.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

/** A1, B1 … Z1, AA1. */
function referencia(col: number, lin: number) {
  let s = "";
  let n = col + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return `${s}${lin + 1}`;
}

/**
 * Data como número de série do Excel, pelo relógio de parede.
 *
 * Uma planilha não tem fuso: "14:30" é o que a pessoa leu no relógio. Por
 * isso a data entra pelos seus campos locais, e não pelo instante em UTC.
 */
export function serialExcel(d: Date): number {
  const utc = Date.UTC(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  );
  return utc / 86400000 + 25569;
}

// Índices dos estilos em styles.xml (cellXfs).
const ESTILO = { texto: 0, cabecalho: 1, data: 2, hora: 3, dataHora: 4, duracao: 5, numero: 6 };

const ESTILOS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="5"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="hh:mm"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy hh:mm"/><numFmt numFmtId="167" formatCode="[h]:mm"/><numFmt numFmtId="168" formatCode="0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function celulaXml(v: Celula, col: number, lin: number, formato: Coluna["formato"]): string {
  const ref = referencia(col, lin);
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    const estilo = ESTILO[formato === "hora" || formato === "dataHora" ? formato : "data"];
    return `<c r="${ref}" s="${estilo}"><v>${serialExcel(v)}</v></c>`;
  }
  if (typeof v === "object" && "duracaoSeg" in v) {
    return `<c r="${ref}" s="${ESTILO.duracao}"><v>${v.duracaoSeg / 86400}</v></c>`;
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    const estilo = formato === "numero" ? ESTILO.numero : ESTILO.texto;
    return `<c r="${ref}" s="${estilo}"><v>${v}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
}

function abaXml(aba: Aba): string {
  const cols = aba.colunas
    .map(
      (c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura ?? 14}" customWidth="1"/>`,
    )
    .join("");
  const cabecalho = `<row r="1">${aba.colunas
    .map(
      (c, i) =>
        `<c r="${referencia(i, 0)}" s="${ESTILO.cabecalho}" t="inlineStr"><is><t>${xml(c.titulo)}</t></is></c>`,
    )
    .join("")}</row>`;
  const linhas = aba.linhas
    .map(
      (l, li) =>
        `<row r="${li + 2}">${l.map((v, ci) => celulaXml(v, ci, li + 1, aba.colunas[ci]?.formato)).join("")}</row>`,
    )
    .join("");
  const ultima = referencia(Math.max(aba.colunas.length - 1, 0), aba.linhas.length);
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols><sheetData>${cabecalho}${linhas}</sheetData>` +
    (aba.colunas.length ? `<autoFilter ref="A1:${ultima}"/>` : "") +
    `</worksheet>`
  );
}

/** Nome de aba válido: até 31 caracteres, sem : \ / ? * [ ], e sem repetir. */
function nomesDeAba(abas: Aba[]): string[] {
  const usados = new Set<string>();
  return abas.map((a, i) => {
    let base = String(a.nome || `Aba ${i + 1}`)
      .replace(/[:\\/?*[\]]/g, "-")
      .slice(0, 31);
    let nome = base;
    for (let n = 2; usados.has(nome.toLowerCase()); n++) {
      base = base.slice(0, 31 - String(n).length - 1);
      nome = `${base} ${n}`;
    }
    usados.add(nome.toLowerCase());
    return nome;
  });
}

/** O arquivo .xlsx, pronto para virar Blob. */
export function gerarXlsx(abas: Aba[]): Uint8Array {
  const enc = new TextEncoder();
  const nomes = nomesDeAba(abas);
  const arquivos = [
    {
      nome: "[Content_Types].xml",
      texto:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        abas
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        `</Types>`,
    },
    {
      nome: "_rels/.rels",
      texto:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      nome: "xl/workbook.xml",
      texto:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>${nomes.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
        `<definedNames>${abas
          .map((a, i) =>
            a.colunas.length
              ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(nomes[i]).replace(/'/g, "''")}'!$A$1:$${referencia(a.colunas.length - 1, 0).replace(/\d+$/, "")}$${a.linhas.length + 1}</definedName>`
              : "",
          )
          .join("")}</definedNames>` +
        `</workbook>`,
    },
    {
      nome: "xl/_rels/workbook.xml.rels",
      texto:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        abas
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join("") +
        `<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    },
    { nome: "xl/styles.xml", texto: ESTILOS_XML },
    ...abas.map((a, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, texto: abaXml(a) })),
  ];
  return zipar(arquivos.map((a) => ({ nome: a.nome, dados: enc.encode(a.texto) })));
}
