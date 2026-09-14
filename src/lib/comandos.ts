// Comandos escritos dentro do texto.
//
// A menção sozinha é aviso: "@bruno seguir com isso" aparece no sino dele.
// Com !task, o mesmo texto vira tarefa de verdade na lista dele — o que muda
// não é para quem vai, é o peso: aviso se lê e esquece, tarefa fica cobrando.
//
// A ideia é a mesma que já funciona nas atas, onde as linhas do TO-DO viram
// cards com os @ como responsáveis. Aqui é a versão pontual, para quando a
// tarefa nasce no meio de uma conversa em vez de numa reunião.

import type { Profile } from "@/lib/profiles";
import type { Item } from "@/lib/dashboardTypes";

/** Aceita !task e !tarefa, em qualquer caixa e em qualquer posição do texto. */
const RE_TASK = /!\s*(task|tarefa)\b/gi;

const RE_MENCAO = /@([a-zA-Z0-9._-]+)/g;

export type TextoInterpretado = {
  /** O texto pede que isto vire tarefa? */
  ehTarefa: boolean;
  /** Ids das pessoas mencionadas, na ordem em que aparecem, sem repetir. */
  mencionados: string[];
  /** O texto sem o comando, para ficar legível no card. As menções ficam. */
  textoLimpo: string;
  /**
   * A linha onde o !task foi escrito.
   *
   * Num comentário curto dá na mesma, mas num campo longo — "o que foi
   * conversado", uma descrição, uma transcrição — o nome do card tem que sair
   * de onde o comando está, não da primeira frase do texto inteiro. Sem isto,
   * escrever "!task fechar o buffet" no fim de um parágrafo criava um card
   * chamado pela primeira frase do parágrafo.
   */
  trecho: string;
};

export function interpretarTexto(texto: string, profiles: Profile[]): TextoInterpretado {
  const original = String(texto || "");
  const ehTarefa = RE_TASK.test(original);
  RE_TASK.lastIndex = 0; // regex global guarda estado entre chamadas

  const vistos = new Set<string>();
  const mencionados: string[] = [];
  for (const m of original.matchAll(RE_MENCAO)) {
    const p = profiles.find((x) => x.username?.toLowerCase() === m[1].toLowerCase());
    if (p && !vistos.has(p.id)) {
      vistos.add(p.id);
      mencionados.push(p.id);
    }
  }

  const textoLimpo = original
    .replace(RE_TASK, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  RE_TASK.lastIndex = 0;

  // O pedaço onde o comando foi escrito: primeiro a linha, e dentro dela a
  // frase. "Falamos do evento. @bruno fechar o buffet !task" numa linha só tem
  // que virar "fechar o buffet", não "Falamos do evento".
  const pedacos = original.split("\n").flatMap((l) => l.split(/(?<=[.!?;])\s+/));
  const comComando = pedacos.find((pedaco) => {
    RE_TASK.lastIndex = 0;
    return RE_TASK.test(pedaco);
  });
  RE_TASK.lastIndex = 0;
  const trecho = comComando
    ? comComando
        .replace(RE_TASK, "")
        .replace(/[ \t]{2,}/g, " ")
        .trim()
    : textoLimpo;
  RE_TASK.lastIndex = 0;

  return { ehTarefa, mencionados, textoLimpo, trecho };
}

/**
 * O que mudou entre duas versões de um mesmo texto.
 *
 * Campos como descrição e observação salvam a cada tecla e são reeditados
 * muitas vezes. Avisar sempre que o texto muda mandaria a mesma menção dez
 * vezes; por isso só conta quem foi mencionado agora e não estava antes.
 * O mesmo vale para o !task: só dispara quando o comando acabou de aparecer.
 */
export function diferencaDeTexto(
  antes: string,
  depois: string,
  profiles: Profile[],
): TextoInterpretado {
  const a = interpretarTexto(antes, profiles);
  const d = interpretarTexto(depois, profiles);
  const jaMencionado = new Set(a.mencionados);
  return {
    ehTarefa: d.ehTarefa && !a.ehTarefa,
    mencionados: d.mencionados.filter((id) => !jaMencionado.has(id)),
    textoLimpo: d.textoLimpo,
    trecho: d.trecho,
  };
}

/** Há algo a fazer com este texto? Evita chamadas de rede à toa. */
export function temAlgoAFazer(i: TextoInterpretado): boolean {
  return i.ehTarefa || i.mencionados.length > 0;
}

/**
 * Nome curto para o card, a partir de um texto corrido.
 *
 * Um comentário inteiro não serve como nome — vira uma linha ilegível no
 * quadro. Pega a primeira frase; se ela for longa demais, corta na palavra.
 * O texto completo não se perde: vai para a descrição do card.
 */
export function nomeDaTarefa(texto: string, limite = 90): string {
  const limpo = String(texto || "")
    .replace(RE_MENCAO, "")
    .replace(/\s+/g, " ")
    .trim();
  RE_MENCAO.lastIndex = 0;
  if (!limpo) return "Tarefa";

  const primeiraFrase = limpo.split(/(?<=[.!?;])\s+/)[0] || limpo;
  const base = primeiraFrase.length <= limite ? primeiraFrase : limpo;
  if (base.length <= limite) return base.replace(/[.,;:]+$/, "");

  const cortado = base.slice(0, limite);
  const ultimoEspaco = cortado.lastIndexOf(" ");
  return (ultimoEspaco > limite * 0.6 ? cortado.slice(0, ultimoEspaco) : cortado).replace(
    /[.,;:]+$/,
    "",
  );
}

function uid() {
  return `_${Math.random().toString(36).slice(2, 9)}`;
}

function dataBR(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export type OrigemTarefa = {
  /** De onde o texto veio, para dar contexto a quem receber. */
  descricaoOrigem: string;
  /** Id do comentário ou nota que originou, para rastrear. */
  origemId?: string;
};

/**
 * Monta o card a partir do texto.
 *
 * Sem ninguém mencionado, a tarefa fica com quem escreveu: anotar "!task
 * revisar isso" sozinho é lembrete próprio, e cair sem dono seria pior.
 */
export function tarefaDeTexto(
  interpretado: TextoInterpretado,
  autorId: string | null,
  origem: OrigemTarefa,
  agora: Date = new Date(),
): Item {
  const iso = agora.toISOString();
  const responsaveis = interpretado.mencionados.length
    ? interpretado.mencionados
    : autorId
      ? [autorId]
      : [];

  return {
    id: `it${uid()}`,
    name: nomeDaTarefa(interpretado.trecho || interpretado.textoLimpo),
    tipo: "Outro",
    responsavel: "",
    responsaveis,
    status: "Não iniciado",
    kanbanStatus: "A Fazer",
    obs: "",
    // O texto integral fica na descrição: o nome é só o rótulo.
    descricao: `${interpretado.trecho || interpretado.textoLimpo}\n\n- ${origem.descricaoOrigem}`,
    prazo: "",
    dataInicio: dataBR(agora),
    criadoEm: iso,
    statusChangedAt: iso,
    checklist: [],
    etiquetas: [],
    ...(origem.origemId ? { origemComentarioId: origem.origemId } : {}),
    criadaPorComando: true,
  };
}
