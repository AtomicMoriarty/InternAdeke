// Pequenas funções que o app inteiro usa.
//
// Cada uma existia copiada em quatro a seis arquivos, e as cópias começavam a
// divergir (uma busca normalizava espaços, outra não). Uma versão só, aqui.
//
// Fica sem imports com "@/" para rodar direto no node --test.

/** Id curto para itens dentro do estado (cards, checklist, comentários). */
export function uid() {
  return `_${Math.random().toString(36).slice(2, 9)}`;
}

/** "31/12/2026", a data no formato em que o estado guarda. */
export function dataBR(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Hoje, como dataBR. */
export function hojeBR() {
  return dataBR(new Date());
}

/**
 * Texto para comparar: sem acento, minúsculo, espaços repetidos viram um.
 *
 * "Ação  Societária" e "acao societaria" são a mesma coisa para busca,
 * casamento de nomes e leitura de transcrição.
 */
export function semAcento(s: unknown) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
