// Upload de arquivos para os cards.
//
// O bucket "anexos" é PRIVADO: são contratos, atas e procurações de clientes,
// que não podem ficar acessíveis por URL pública. Nada aqui devolve link
// permanente — para abrir um arquivo pede-se um link assinado, válido por
// alguns minutos e só para quem está autenticado.

import { supabase } from "@/integrations/supabase/client";

export const BUCKET = "anexos";
export const TAMANHO_MAXIMO = 25 * 1024 * 1024; // igual ao limite do bucket
const VALIDADE_LINK_SEGUNDOS = 300; // 5 minutos

export type Anexo = {
  id: string;
  nome: string;
  /** Caminho dentro do bucket. É por aqui que se pede o link assinado. */
  caminho: string;
  tamanho: number;
  tipo: string;
  enviadoEm: string;
  autorId: string | null;
  autorNome: string;
  /** Anexos antigos guardavam só um link colado à mão. */
  url?: string;
};

/** Um anexo é arquivo no bucket ou link externo colado à mão? */
export function ehArquivo(a: Anexo): boolean {
  return !!a?.caminho;
}

export function formatarTamanho(bytes: number): string {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Nome seguro para o caminho, preservando a extensão.
 *
 * Descarta qualquer trecho de diretório antes de limpar: um nome como
 * "../../etc/passwd" precisa virar um nome simples, senão escaparia da pasta do
 * item ao ser concatenado no caminho.
 */
export function nomeSeguro(nome: string): string {
  const semCaminho = String(nome).split(/[/\\]/).pop() || "";
  const semTravessia = semCaminho.replace(/\.{2,}/g, ".");
  const ponto = semTravessia.lastIndexOf(".");
  const base = ponto > 0 ? semTravessia.slice(0, ponto) : semTravessia;
  const ext = ponto > 0 ? semTravessia.slice(ponto).toLowerCase() : "";
  const limpo = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return (limpo || "arquivo") + ext.replace(/[^a-zA-Z0-9.]/g, "");
}

/** Caminho do arquivo: agrupado por item, com sufixo único contra colisão. */
export function montarCaminho(itemId: string, nomeArquivo: string): string {
  const sufixo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${itemId}/${sufixo}-${nomeSeguro(nomeArquivo)}`;
}

export type ResultadoUpload = { ok: true; anexo: Anexo } | { ok: false; erro: string };

export async function enviarAnexo(
  arquivo: File,
  itemId: string,
  autor: { id: string | null; nome: string },
): Promise<ResultadoUpload> {
  if (arquivo.size > TAMANHO_MAXIMO) {
    return {
      ok: false,
      erro: `Arquivo tem ${formatarTamanho(arquivo.size)}; o limite é ${formatarTamanho(TAMANHO_MAXIMO)}.`,
    };
  }

  const caminho = montarCaminho(itemId, arquivo.name);
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
    cacheControl: "3600",
    upsert: false,
    contentType: arquivo.type || undefined,
  });

  if (error) {
    // O bucket restringe os tipos aceitos; a mensagem crua não ajuda o usuário.
    const msg = /mime|content type/i.test(error.message)
      ? "Tipo de arquivo não permitido. Aceita PDF, Word, Excel, PowerPoint, imagens, texto e zip."
      : error.message;
    return { ok: false, erro: msg };
  }

  return {
    ok: true,
    anexo: {
      id: `ax${Math.random().toString(36).slice(2, 9)}`,
      nome: arquivo.name,
      caminho,
      tamanho: arquivo.size,
      tipo: arquivo.type || "",
      enviadoEm: new Date().toISOString(),
      autorId: autor.id,
      autorNome: autor.nome,
    },
  };
}

/**
 * Link temporário para abrir ou baixar o arquivo.
 * Expira em minutos — não serve para compartilhar por fora.
 */
export async function linkTemporario(caminho: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(caminho, VALIDADE_LINK_SEGUNDOS);
  if (error) {
    console.error("[anexos] falha ao gerar link", error);
    return null;
  }
  return data?.signedUrl || null;
}

/** Remove o arquivo do bucket. Erro aqui não deve impedir tirar da lista. */
export async function apagarAnexo(caminho: string): Promise<boolean> {
  const { error } = await supabase.storage.from(BUCKET).remove([caminho]);
  if (error) {
    console.error("[anexos] falha ao apagar do storage", error);
    return false;
  }
  return true;
}
