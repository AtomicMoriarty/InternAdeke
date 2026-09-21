// Em que tela o sistema abre.
//
// O padrão é o Painel, que mostra números do escritório inteiro. Mas a
// pergunta que a pessoa tem às nove da manhã é "o que eu tenho que fazer
// hoje", e quem responde isso é a tela "Eu". Quem quiser pode dizer que é
// dali que quer começar.
//
// A preferência mora no navegador, por usuário: é gosto de quem olha, não
// dado do escritório, e numa máquina compartilhada não pode misturar.

const CHAVE = "adeke:telaInicial:";
/**
 * Marca que o desvio já aconteceu nesta aba.
 *
 * Sem ela, clicar em "Voltar" dentro do Eu levaria à raiz, que desviaria de
 * volta para o Eu: a pessoa ficaria presa sem entender por quê. Com a marca,
 * o desvio vale uma vez por aba — na chegada — e a navegação de dentro do
 * sistema continua livre.
 */
const MARCA_DA_ABA = "adeke:telaInicial:jaDesviou";

export type TelaInicial = "painel" | "eu";

export function telaInicial(userId?: string): TelaInicial {
  if (!userId) return "painel";
  try {
    return localStorage.getItem(CHAVE + userId) === "eu" ? "eu" : "painel";
  } catch {
    // Aba anônima ou storage bloqueado: o padrão serve.
    return "painel";
  }
}

export function definirTelaInicial(userId: string, tela: TelaInicial) {
  try {
    if (tela === "painel") localStorage.removeItem(CHAVE + userId);
    else localStorage.setItem(CHAVE + userId, tela);
  } catch {
    // Não poder lembrar não pode quebrar a tela que a pessoa está usando.
  }
}

/** Já desviamos nesta aba? Se sim, não desvia de novo. */
export function deveDesviar(userId?: string): boolean {
  if (telaInicial(userId) !== "eu") return false;
  try {
    if (sessionStorage.getItem(MARCA_DA_ABA)) return false;
    sessionStorage.setItem(MARCA_DA_ABA, "1");
    return true;
  } catch {
    return false;
  }
}
