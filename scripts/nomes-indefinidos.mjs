// Procura nomes que não existem — a classe de erro que derruba a página.
//
// Por que este script existe, e não basta o `npm run typecheck`:
//
// Nove arquivos do projeto começam com @ts-nocheck, herdado de quando o código
// era JavaScript. Dentro deles o TypeScript não olha nada, e foi exatamente aí
// que dois "Cannot find name" chegaram em produção: `modoSelecao` derrubou o
// Quadro Geral inteiro, e `KANBAN_COLUMNS` derrubou a aba Itens dos relatórios.
// O vite build também não pega, porque o esbuild apaga os tipos sem conferir.
//
// Tirar o @ts-nocheck de todos exigiria arrumar centenas de erros de tipagem
// frouxa, que são chateação e não risco. Este script separa as duas coisas:
// copia o src para um diretório temporário, remove o @ts-nocheck de todo mundo,
// e reclama SÓ dos nomes que não existem. O resto do barulho fica de fora.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const RAIZ = process.cwd();
const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), "nomes-"));

/** Erros de identificador inexistente. O resto da tipagem não interessa aqui. */
const INTERESSA = /error (TS2304|TS2552|TS2686):/;

function copiarSemNocheck(de, para) {
  fs.mkdirSync(para, { recursive: true });
  for (const entrada of fs.readdirSync(de, { withFileTypes: true })) {
    const origem = path.join(de, entrada.name);
    const destino = path.join(para, entrada.name);
    if (entrada.isDirectory()) {
      copiarSemNocheck(origem, destino);
    } else if (/\.(ts|tsx)$/.test(entrada.name)) {
      const texto = fs.readFileSync(origem, "utf8");
      fs.writeFileSync(destino, texto.replace(/^\/\/\s*@ts-nocheck[^\n]*\n/, ""));
    } else {
      fs.copyFileSync(origem, destino);
    }
  }
}

try {
  copiarSemNocheck(path.join(RAIZ, "src"), path.join(TEMP, "src"));
  for (const arquivo of ["tsconfig.json", "tsconfig.app.json", "tsconfig.node.json"]) {
    const origem = path.join(RAIZ, arquivo);
    if (fs.existsSync(origem)) fs.copyFileSync(origem, path.join(TEMP, arquivo));
  }
  // node_modules por link: copiar levaria minutos e ocuparia disco à toa.
  fs.symlinkSync(path.join(RAIZ, "node_modules"), path.join(TEMP, "node_modules"), "junction");

  let saida = "";
  try {
    execSync("npx tsc --noEmit -p tsconfig.json", { cwd: TEMP, encoding: "utf8" });
  } catch (e) {
    saida = `${e.stdout || ""}${e.stderr || ""}`;
  }

  const achados = saida
    .split("\n")
    .filter((linha) => INTERESSA.test(linha))
    .map((linha) => linha.trim());

  if (achados.length) {
    console.error(`\n${achados.length} nome(s) que não existem:\n`);
    for (const a of achados) console.error("  " + a);
    console.error(
      "\nIsto quebra a página em tempo de execução, não na compilação.\n" +
        "Normalmente é prop recebida sem declarar na assinatura, ou import esquecido.\n",
    );
    process.exit(1);
  }
  console.log("Nenhum nome indefinido.");
} finally {
  fs.rmSync(TEMP, { recursive: true, force: true });
}
