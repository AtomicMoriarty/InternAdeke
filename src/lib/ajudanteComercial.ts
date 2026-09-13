// Ajudante Comercial: monta o follow-up a partir do caso narrado.
//
// Não é IA e não finge ser. É um gerador com regras: a pessoa conta o que
// aconteceu — quem, de que área, há quantos dias sem resposta, sobre o quê — e
// daqui sai a mensagem pronta para revisar e enviar.
//
// Três coisas governam o texto:
//
//   a situação  → define o que a mensagem pede (confirmar, retomar, encerrar)
//   os dias     → define o tom; insistir no dia 2 e no dia 40 não é a mesma coisa
//   a área      → entra com o gancho técnico, que é o que dá motivo para o contato
//
// Sobre prazos legais: nenhum template afirma número de dias por conta própria.
// Prazo errado numa mensagem que sai com o nome do escritório é risco real, não
// deslize de copy. Onde o prazo importa, ele é campo que a pessoa preenche.

export type Canal = "whatsapp" | "email" | "ligacao" | "linkedin";

export const CANAIS: { id: Canal; nome: string; limite: number }[] = [
  // O limite é orientação de tamanho: WhatsApp longo não é lido.
  { id: "whatsapp", nome: "WhatsApp", limite: 420 },
  { id: "email", nome: "E-mail", limite: 1400 },
  { id: "ligacao", nome: "Roteiro de ligação", limite: 900 },
  { id: "linkedin", nome: "LinkedIn", limite: 500 },
];

export type SituacaoDef = {
  id: string;
  nome: string;
  descricao: string;
  /** Pede a data/hora da reunião no formulário. */
  pedeReuniao?: boolean;
  /** A contagem de dias sem resposta muda o texto. */
  usaDias?: boolean;
};

export const SITUACOES: SituacaoDef[] = [
  {
    id: "confirmacao",
    nome: "Confirmação de reunião",
    descricao: "A reunião está marcada e você quer confirmar antes.",
    pedeReuniao: true,
  },
  {
    id: "atraso",
    nome: "Atraso ou ausência na reunião",
    descricao: "A hora chegou e a pessoa não apareceu.",
    pedeReuniao: true,
  },
  {
    id: "semResposta",
    nome: "Sem resposta ao primeiro contato",
    descricao: "Você procurou, não voltaram.",
    usaDias: true,
  },
  {
    id: "propostaParada",
    nome: "Proposta enviada sem retorno",
    descricao: "A proposta foi, o silêncio veio.",
    usaDias: true,
  },
  {
    id: "gancho",
    nome: "Tema que conversa com o nosso",
    descricao: "Saiu algo - norma, decisão, notícia - que afeta o cliente.",
  },
  {
    id: "retomada",
    nome: "Retomada de conversa parada",
    descricao: "Conversaram, ficou de avançar, esfriou.",
    usaDias: true,
  },
  {
    id: "pendencia",
    nome: "Cobrança de pendência",
    descricao: "Você depende de um documento ou de uma definição deles.",
    usaDias: true,
  },
  {
    id: "encerramento",
    nome: "Encerramento (breakup)",
    descricao: "Última mensagem. Encerra o acompanhamento sem ressentimento.",
    usaDias: true,
  },
  {
    id: "posFechamento",
    nome: "Pós-fechamento",
    descricao: "Fechou. Agora é começar bem.",
  },
];

export function situacaoPorId(id: string) {
  return SITUACOES.find((s) => s.id === id);
}

// ─── Áreas e seus ganchos ────────────────────────────────────────────────────
//
// O gancho é o motivo técnico do contato. Sem ele o follow-up é "passando para
// saber", que é o que faz o cliente não responder. As sugestões abaixo servem
// para a pessoa escolher rápido; o texto final usa o que ela escrever.

export type AreaDef = {
  id: string;
  nome: string;
  /** Como o escritório se apresenta nesta área, em uma linha. */
  competencia: string;
  /** Assuntos que costumam justificar um contato. Viram sugestão na tela. */
  ganchos: string[];
  /** O que oferecer como próximo passo concreto. */
  ofertas: string[];
};

export const AREAS_AJUDANTE: AreaDef[] = [
  {
    id: "societario",
    nome: "Societário",
    competencia: "estruturação societária e governança",
    ganchos: [
      "Planejamento sucessório e holding familiar",
      "Entrada de novo sócio ou investidor",
      "Acordo de sócios desatualizado",
      "Alteração contratual pendente de arquivamento",
      "Reorganização societária do grupo",
      "Saída ou falecimento de sócio",
      "Mudança nas regras de tributação sobre herança e doação",
    ],
    ofertas: [
      "uma leitura do contrato social atual e do que ele deixa em aberto",
      "um diagnóstico da estrutura societária do grupo",
      "uma conversa de 30 minutos para mapear o cenário",
    ],
  },
  {
    id: "compliance",
    nome: "Compliance & Ética",
    competencia: "programas de integridade e gestão de riscos",
    ganchos: [
      "Exigência de programa de integridade em contrato ou licitação",
      "Due diligence de terceiros e fornecedores",
      "Canal de denúncias e apuração interna",
      "Prevenção e apuração de assédio",
      "Denúncia recebida sem rito definido",
      "Auditoria ou cliente exigindo evidências de integridade",
      "Treinamento e código de conduta desatualizados",
    ],
    ofertas: [
      "um diagnóstico do programa de integridade atual",
      "um desenho de canal de denúncias e do rito de apuração",
      "uma conversa para entender a exposição de vocês hoje",
    ],
  },
  {
    id: "lgpd",
    nome: "LGPD & Privacidade",
    competencia: "adequação e governança de dados pessoais",
    ganchos: [
      "Fiscalização e sanções aplicadas pela ANPD",
      "Incidente de segurança com dados pessoais",
      "Mapeamento de dados e registro de operações",
      "Encarregado (DPO) não designado",
      "Transferência internacional de dados",
      "Pedido de titular sem processo definido para responder",
      "Cliente ou parceiro exigindo cláusulas de proteção de dados",
    ],
    ofertas: [
      "um diagnóstico de adequação, sem compromisso",
      "um mapeamento das operações de tratamento de dados",
      "uma conversa de 30 minutos sobre o cenário de vocês",
    ],
  },
  {
    id: "inpi",
    nome: "INPI & Marcas",
    competencia: "registro e defesa de marcas",
    ganchos: [
      "Marca em uso sem registro no INPI",
      "Publicação de pedido de terceiro que pode colidir",
      "Exigência do INPI a cumprir",
      "Prazo de oposição em curso",
      "Concessão pendente de pagamento",
      "Renovação de registro se aproximando",
      "Uso indevido da marca por terceiro",
    ],
    ofertas: [
      "uma busca de anterioridade para ver o risco real",
      "uma análise do processo e do que ele exige agora",
      "um levantamento da carteira de marcas de vocês",
    ],
  },
  {
    id: "comercial",
    nome: "Geral / Comercial",
    competencia: "assessoria jurídica empresarial",
    ganchos: [
      "Proposta comercial em aberto",
      "Renovação de contrato se aproximando",
      "Nova demanda mencionada em conversa anterior",
      "Indicação de cliente ou parceiro",
      "Mudança de estrutura ou crescimento da empresa",
    ],
    ofertas: [
      "uma conversa de 30 minutos para entender a necessidade",
      "uma proposta ajustada ao escopo que faz sentido agora",
      "um retorno com o desenho do trabalho e os valores",
    ],
  },
];

export function areaPorId(id: string) {
  return AREAS_AJUDANTE.find((a) => a.id === id);
}

// ─── Tom conforme o tempo de silêncio ────────────────────────────────────────

export type Tom = {
  id: string;
  nome: string;
  /** A partir de quantos dias sem resposta este tom vale. */
  desde: number;
  explicacao: string;
};

export const TONS: Tom[] = [
  { id: "leve", nome: "Leve", desde: 0, explicacao: "Ainda é continuação da conversa." },
  {
    id: "reforco",
    nome: "Com reforço",
    desde: 4,
    explicacao: "Traz algo novo, não repete a pergunta.",
  },
  {
    id: "direto",
    nome: "Direto",
    desde: 8,
    explicacao: "Pergunta abertamente se ainda faz sentido.",
  },
  {
    id: "ultimo",
    nome: "Última tentativa",
    desde: 15,
    explicacao: "Antecipa a objeção e facilita o não.",
  },
  {
    id: "encerra",
    nome: "Encerramento",
    desde: 30,
    explicacao: "Fecha o acompanhamento. Costuma ser a que mais responde.",
  },
];

export function tomPorDias(dias: number): Tom {
  let escolhido = TONS[0];
  for (const t of TONS) if (dias >= t.desde) escolhido = t;
  return escolhido;
}

// ─── O caso narrado ──────────────────────────────────────────────────────────

export type Caso = {
  situacao: string;
  canal: Canal;
  area: string;
  /** Nome de quem recebe. Só o primeiro nome é usado no corpo. */
  contato: string;
  empresa: string;
  /** Sobre o que é. Vai no corpo da mensagem quase como escrito. */
  assunto: string;
  /** Dias desde o último contato sem retorno. */
  diasSemResposta: number;
  /** Data/hora da reunião, quando a situação pede. */
  reuniao: string;
  /** Prazo relevante, como a pessoa quiser escrever ("até 20/10", "60 dias"). */
  prazo: string;
  /** Quem assina. */
  remetente: string;
  /** Tratamento: a lista abaixo cobre o uso do escritório. */
  tratamento: string;
};

export const TRATAMENTOS = ["Dr.", "Dra.", "Sr.", "Sra.", "sem tratamento"];

export function casoVazio(): Caso {
  return {
    situacao: "semResposta",
    canal: "whatsapp",
    area: "comercial",
    contato: "",
    empresa: "",
    assunto: "",
    diasSemResposta: 0,
    reuniao: "",
    prazo: "",
    remetente: "",
    tratamento: "sem tratamento",
  };
}

/**
 * Primeiro nome: "Dra. Juliana Lima" vira "Juliana" no meio da frase.
 *
 * O tratamento sai porque ele é escolhido em campo separado — deixá-lo aqui
 * produz "Dra. Dra. Juliana".
 */
function primeiroNome(nome: string): string {
  const limpo = String(nome || "")
    .replace(/^(dra?|sra?|excelent[ií]ssim[oa])\.?\s+/i, "")
    .trim();
  return limpo.split(/\s+/)[0] || "";
}

/**
 * O assunto como sujeito da frase, sem a preposição.
 *
 * "sobre X" e "X saiu da pauta" pedem formas diferentes; usar a mesma produz
 * "Se sobre o planejamento saiu da pauta".
 */
function oAssunto(caso: Caso): string {
  const a = caso.assunto.trim();
  if (!a) return "o assunto que conversamos";
  const semPrep = a.replace(/^(sobre|a respeito de|quanto a)\s+/i, "");
  return `${semPrep[0].toLowerCase()}${semPrep.slice(1)}`;
}

/**
 * Assunto de e-mail: curto e capitalizado.
 *
 * O que a pessoa escreve no formulário costuma ser uma frase inteira em
 * minúscula, que fica péssima na caixa de entrada. Se não couber, o nome da
 * área serve melhor do que a frase cortada no meio — "Marca de terceiro que"
 * é pior do que "INPI & Marcas".
 */
function assuntoCurto(caso: Caso, limite = 55): string {
  const bruto = caso.assunto.trim();
  if (!bruto) return "";
  const nu = oAssunto(caso);
  const cap = `${nu[0].toUpperCase()}${nu.slice(1)}`.replace(/[.,;:]+$/, "");
  return cap.length <= limite ? cap : areaPorId(caso.area)?.nome || "";
}

function saudacao(caso: Caso): string {
  const nome = primeiroNome(caso.contato);
  if (!nome) return "Olá";
  if (caso.tratamento === "sem tratamento") return `Olá, ${nome}`;
  return `${caso.tratamento} ${nome}`;
}

function assinatura(caso: Caso): string {
  const nome = caso.remetente.trim();
  return nome ? `${nome}\nPorto e Pacca` : "Porto e Pacca";
}

/** "sobre a adequação à LGPD" — usa o que a pessoa escreveu, sem inventar. */
function sobreOAssunto(caso: Caso): string {
  const a = caso.assunto.trim();
  if (!a) return "sobre o assunto que conversamos";
  // Se já vem com preposição, não duplica.
  return /^(sobre|a respeito|quanto)/i.test(a) ? a : `sobre ${a[0].toLowerCase()}${a.slice(1)}`;
}

function comEmpresa(caso: Caso): string {
  return caso.empresa.trim() ? ` da ${caso.empresa.trim()}` : "";
}

function trechoPrazo(caso: Caso): string {
  const p = caso.prazo.trim();
  return p ? ` O prazo que conversamos é ${p}.` : "";
}

function ofertaDaArea(caso: Caso, i = 0): string {
  const area = areaPorId(caso.area);
  const lista = area?.ofertas || [];
  return lista[i % Math.max(1, lista.length)] || "uma conversa rápida";
}

// ─── A mensagem gerada ───────────────────────────────────────────────────────

export type Mensagem = {
  id: string;
  /** Como esta variação se posiciona. Ajuda a escolher sem ler as três. */
  postura: string;
  assuntoEmail?: string;
  corpo: string;
};

export type Resultado = {
  tom: Tom;
  mensagens: Mensagem[];
  /** Quando voltar, se não responderem desta vez. */
  sugestaoProximoPasso: string;
  /** Avisos honestos sobre o caso, quando cabem. */
  observacoes: string[];
};

/**
 * Monta as variações da mensagem.
 *
 * Sempre três posturas diferentes, não três jeitos de dizer a mesma coisa: uma
 * curta, uma que traz o gancho técnico e uma que facilita o não. Quem escreve
 * escolhe pela postura, não pelo texto.
 */
export function gerarFollowups(caso: Caso): Resultado {
  const tom = tomPorDias(caso.diasSemResposta);
  const observacoes: string[] = [];

  if (!caso.contato.trim()) observacoes.push("Sem o nome do contato, a mensagem começa genérica.");
  if (!caso.assunto.trim())
    observacoes.push("Sem o assunto, a mensagem fica vaga - é o campo que mais muda o resultado.");
  if (caso.diasSemResposta >= 30 && caso.situacao !== "encerramento")
    observacoes.push(
      "Mais de 30 dias em silêncio: considere a situação Encerramento. É a mensagem que mais recebe resposta.",
    );
  if (caso.canal === "whatsapp" && caso.situacao === "propostaParada")
    observacoes.push(
      "Proposta parada costuma render mais por e-mail, onde cabe o anexo e o valor.",
    );

  const mensagens = montarVariacoes(caso, tom);

  return {
    tom,
    mensagens,
    sugestaoProximoPasso: proximoPassoSugerido(caso, tom),
    observacoes,
  };
}

function proximoPassoSugerido(caso: Caso, tom: Tom): string {
  if (caso.situacao === "encerramento") return "Nenhum: o acompanhamento foi encerrado.";
  if (caso.situacao === "confirmacao") return "Confirmar presença no dia anterior.";
  if (tom.id === "leve") return "Voltar em 3 dias úteis se não houver resposta.";
  if (tom.id === "reforco") return "Voltar em 4 dias, por outro canal.";
  if (tom.id === "direto") return "Voltar em 7 dias; se seguir em silêncio, enviar o encerramento.";
  return "Enviar o encerramento em 7 dias e liberar o negócio do funil.";
}

function montarVariacoes(caso: Caso, tom: Tom): Mensagem[] {
  const s = saudacao(caso);
  const nome = primeiroNome(caso.contato);
  const area = areaPorId(caso.area);
  const assunto = sobreOAssunto(caso);
  const nu = oAssunto(caso);
  const assuntoBreve = caso.assunto.trim() ? assuntoCurto(caso) : "";
  const fim = assinatura(caso);
  const email = caso.canal === "email";
  const curto = caso.canal === "whatsapp" || caso.canal === "linkedin";

  const fecho = email
    ? `\n\nAtenciosamente,\n${fim}`
    : caso.remetente
      ? `\n\n${caso.remetente}`
      : "";

  const monta = (postura: string, assuntoEmail: string, corpo: string, i: number): Mensagem => ({
    id: `m${i}`,
    postura,
    assuntoEmail: email ? assuntoEmail : undefined,
    corpo: corpo.replace(/\n{3,}/g, "\n\n").trim() + fecho,
  });

  switch (caso.situacao) {
    // ── Confirmação de reunião ────────────────────────────────────────────
    case "confirmacao": {
      const quando = caso.reuniao.trim() ? ` em ${caso.reuniao.trim()}` : "";
      return [
        monta(
          "Curta e objetiva",
          `Confirmação - reunião${quando}`,
          `${s}, tudo bem?\n\nPassando para confirmar nossa reunião${quando}. Está de pé pelo seu lado?`,
          1,
        ),
        monta(
          "Com pauta, para a reunião render",
          `Reunião${quando} - pauta`,
          `${s}, tudo bem?\n\nConfirmando nossa reunião${quando}.\n\nPara aproveitarmos o tempo, pensei em tratar ${assunto}. Se houver outro ponto que você queira incluir, é só me dizer que eu preparo.`,
          2,
        ),
        monta(
          "Facilitando remarcar",
          `Reunião${quando}`,
          `${s}, tudo bem?\n\nNossa reunião está marcada${quando}. Se a agenda apertou, me avise sem cerimônia que eu remarco - melhor conversar com calma do que correndo.`,
          3,
        ),
      ];
    }

    // ── Atraso ou ausência ────────────────────────────────────────────────
    case "atraso": {
      const quando = caso.reuniao.trim() ? ` de ${caso.reuniao.trim()}` : "";
      return [
        monta(
          "No momento, sem cobrança",
          "Nossa reunião",
          `${s}, tudo bem?\n\nEstou na sala aguardando. Se precisar de alguns minutos, sem problema - fico por aqui.`,
          1,
        ),
        monta(
          "Logo depois, já remarcando",
          `Reencontro - reunião${quando}`,
          `${s}, tudo bem?\n\nNão conseguimos nos encontrar${quando}. Imagino que o dia tenha corrido.\n\nMe diga dois horários que funcionem para você nos próximos dias que eu me ajusto.`,
          2,
        ),
        monta(
          "Se já é a segunda vez",
          "Melhor momento para conversarmos",
          `${s}, tudo bem?\n\nTentamos nos encontrar mais de uma vez e não deu certo - o que costuma significar que o momento não está fácil aí.\n\nPrefere que eu remarque para daqui a algumas semanas, ou faz mais sentido resolvermos ${nu} por escrito mesmo?`,
          3,
        ),
      ];
    }

    // ── Sem resposta ao primeiro contato ──────────────────────────────────
    case "semResposta": {
      const dias = caso.diasSemResposta;
      const gancho = area?.competencia || "assessoria jurídica";
      if (tom.id === "leve" || tom.id === "reforco") {
        return [
          monta(
            "Retomada simples",
            `Retomando - ${assuntoBreve || "nossa conversa"}`,
            `${s}, tudo bem?\n\nEscrevi há ${dias === 1 ? "um dia" : `${dias} dias`} ${assunto} e imagino que a mensagem possa ter se perdido.\n\nFaz sentido conversarmos?`,
            1,
          ),
          monta(
            "Trazendo o motivo técnico",
            `${assuntoBreve || "Assunto"} - ${area?.nome || "Porto e Pacca"}`,
            `${s}, tudo bem?\n\nVoltando ${assunto}.${trechoPrazo(caso)}\n\nTrabalhamos com ${gancho} e posso oferecer ${ofertaDaArea(caso, 0)}. Sem compromisso: se não fizer sentido depois disso, você fica com o diagnóstico de qualquer forma.\n\nTem 30 minutos esta semana?`,
            2,
          ),
          monta(
            "Curta, só para destravar",
            "Uma pergunta rápida",
            `${s}, é ${caso.remetente || "do Porto e Pacca"}.\n\nUma pergunta só: ${nu} ainda está no radar de vocês${comEmpresa(caso)}? Se não estiver, me avise que eu paro de escrever.`,
            3,
          ),
        ];
      }
      return [
        monta(
          "Direta, sem rodeio",
          `${assuntoBreve || "Nossa conversa"} - segue no radar?`,
          `${s}, tudo bem?\n\nEscrevi algumas vezes ${assunto} e não tive retorno, o que normalmente quer dizer uma de três coisas: não é prioridade agora, não sou eu quem deveria falar com você, ou o momento passou.\n\nQualquer uma delas está tudo bem - só me diga qual é para eu saber como proceder.`,
          1,
        ),
        monta(
          "Facilitando o não",
          "Encerro por aqui?",
          `${s}, tudo bem?\n\nNão quero insistir onde não faz sentido. Se ${nu} saiu da pauta, responda apenas "agora não" que eu encerro o acompanhamento e não tomo mais o seu tempo.\n\nSe ainda estiver de pé, me diga um horário que eu me ajusto ao seu.`,
          2,
        ),
        monta(
          "Última com valor na mesa",
          `${assuntoBreve || "Assunto"} - última mensagem`,
          `${s}, tudo bem?\n\nÚltima vez que escrevo ${assunto}.${trechoPrazo(caso)}\n\nSe quiser, deixo ${ofertaDaArea(caso, 1)} agendado e você decide depois com o material em mãos. Se preferir que eu encerre, é só dizer.`,
          3,
        ),
      ];
    }

    // ── Proposta enviada sem retorno ──────────────────────────────────────
    case "propostaParada":
      return [
        monta(
          "Verificando se chegou",
          "Nossa proposta",
          `${s}, tudo bem?\n\nEnviei a proposta ${assunto} há ${caso.diasSemResposta} dias e queria confirmar se chegou até você.\n\nSe algum ponto do escopo ou dos valores precisar de ajuste, me diga qual - é mais rápido acertar do que deixar parado.`,
          1,
        ),
        monta(
          "Antecipando a objeção",
          "Proposta - algum ponto travando?",
          `${s}, tudo bem?\n\nSobre a proposta que enviei: quando ela fica parada, costuma ser por escopo maior do que o necessário, por valor fora do previsto para o momento, ou porque falta alguém interno aprovar.\n\nSe for qualquer um dos três, dá para resolver. Me diga qual é e eu volto com uma alternativa.`,
          2,
        ),
        monta(
          "Oferecendo um recorte menor",
          "Proposta - versão reduzida",
          `${s}, tudo bem?\n\nA proposta ${assunto} segue de pé, mas talvez o escopo inteiro não seja o começo certo.\n\nPosso montar um recorte menor, com o que é mais urgente, e vocês avaliam o resto depois. Quer que eu prepare assim?`,
          3,
        ),
      ];

    // ── Gancho: saiu algo que afeta o cliente ─────────────────────────────
    case "gancho": {
      const oQue = caso.assunto.trim() || "uma mudança relevante para o setor de vocês";
      return [
        monta(
          "Aviso curto, sem venda",
          `${assuntoBreve || "Novidade relevante"}`,
          `${s}, tudo bem?\n\nVi ${oQue} e lembrei${comEmpresa(caso)}, porque pode afetar vocês diretamente.${trechoPrazo(caso)}\n\nQualquer dúvida, estou à disposição.`,
          1,
        ),
        monta(
          "Aviso com leitura do impacto",
          `${assuntoBreve || "Novidade"} - o que muda para vocês`,
          `${s}, tudo bem?\n\nSaiu ${oQue}, e olhando para o cenário${comEmpresa(caso)} isso tende a exigir ajuste de rotina, não só ciência do assunto.${trechoPrazo(caso)}\n\nPosso preparar ${ofertaDaArea(caso, 0)} e apresentar em 30 minutos, sem compromisso. Faz sentido?`,
          2,
        ),
        monta(
          "Com prazo na frente",
          `${assuntoBreve || "Assunto"} - prazo${caso.prazo.trim() ? ` ${caso.prazo.trim()}` : ""}`,
          `${s}, tudo bem?\n\nEscrevo por conta do seguinte: ${oQue}.${trechoPrazo(caso)} O que costuma custar caro aqui não é a adequação em si, é perder a data e ter que resolver depois em condição pior.\n\nConsigo agenda esta semana para avaliarmos o que se aplica a vocês. Prefere qual dia?`,
          3,
        ),
      ];
    }

    // ── Retomada de conversa parada ───────────────────────────────────────
    case "retomada":
      return [
        monta(
          "Com uma novidade na mão",
          "Retomando nossa conversa",
          `${s}, tudo bem?\n\nNossa conversa sobre ${nu} ficou de avançar e o tempo passou - ${caso.diasSemResposta} dias, para ser exato.\n\nDo nosso lado o cenário segue o mesmo e continuo à disposição. Retomamos esta semana?`,
          1,
        ),
        monta(
          "Perguntando o que mudou",
          "O que mudou por aí?",
          `${s}, tudo bem?\n\nQuando conversamos sobre ${nu}, fazia sentido para vocês. Desde então pode ter mudado a prioridade, o orçamento ou quem toca o tema - e qualquer uma dessas muda o que eu deveria propor.\n\nMe atualiza rapidamente? Assim eu volto com algo alinhado ao momento de agora, não ao de ${caso.diasSemResposta} dias atrás.`,
          2,
        ),
        monta(
          "Colocando um marco no calendário",
          "Retomada - proposta de data",
          `${s}, tudo bem?\n\nPara não deixarmos ${assunto} parado indefinidamente: posso reservar 30 minutos na semana que vem para retomarmos do ponto onde ficamos.\n\nSe não for o momento, me diga um mês melhor e eu volto lá na frente, sem insistir no meio.`,
          3,
        ),
      ];

    // ── Cobrança de pendência ─────────────────────────────────────────────
    case "pendencia":
      return [
        monta(
          "Lembrete cordial",
          `Pendência - ${assuntoBreve || "documentação"}`,
          `${s}, tudo bem?\n\nEstamos aguardando ${nu} para dar sequência.${trechoPrazo(caso)}\n\nConsegue nos enviar nesta semana?`,
          1,
        ),
        monta(
          "Explicando o que trava",
          `${assuntoBreve || "Pendência"} - o que depende disso`,
          `${s}, tudo bem?\n\nNosso andamento está parado aguardando ${nu}.${trechoPrazo(caso)}\n\nEnquanto não recebemos, não conseguimos avançar nas etapas seguintes - e o prazo corre do mesmo jeito. Se houver dificuldade para levantar o material, me diga qual que eu ajudo a resolver.`,
          2,
        ),
        monta(
          "Oferecendo caminho alternativo",
          `${assuntoBreve || "Pendência"} - alternativa`,
          `${s}, tudo bem?\n\nSeguimos aguardando ${nu}. Se estiver difícil reunir tudo, posso trabalhar com o que já tiver disponível e complementamos depois.\n\nMe diga o que consegue enviar hoje que eu sigo com isso.`,
          3,
        ),
      ];

    // ── Encerramento ──────────────────────────────────────────────────────
    case "encerramento":
      return [
        monta(
          "Curto e digno",
          "Encerrando por aqui",
          `${s}, tudo bem?\n\nTentei contato algumas vezes ${assunto} e não tive retorno, então vou encerrar o acompanhamento por aqui para não tomar mais o seu tempo.\n\nSe o tema voltar à pauta, é só me procurar - fico à disposição.`,
          1,
        ),
        monta(
          "Deixando a porta aberta com data",
          "Encerrando - retomo mais à frente?",
          `${s}, tudo bem?\n\nComo não tivemos retorno ${assunto}, encerro nosso acompanhamento por aqui.\n\nSe preferir, posso retomar daqui a alguns meses, quando o cenário estiver mais claro. Nesse caso, me diga apenas o mês em que devo voltar que eu anoto e não escrevo até lá.`,
          2,
        ),
        monta(
          "Deixando algo de valor ao sair",
          "Encerrando - e uma última observação",
          `${s}, tudo bem?\n\nVou encerrar nosso acompanhamento ${assunto}, já que não foi o momento.\n\nAntes de sair, um ponto que vale independentemente de trabalharmos juntos:${trechoPrazo(caso) || ` ${ofertaDaArea(caso, 2)} costuma ser o primeiro passo mais barato nesse tipo de situação, com qualquer escritório.`}\n\nSucesso por aí.`,
          3,
        ),
      ];

    // ── Pós-fechamento ────────────────────────────────────────────────────
    case "posFechamento":
      return [
        monta(
          "Boas-vindas e próximo passo",
          "Boas-vindas - próximos passos",
          `${s}, tudo bem?\n\nQue bom ter${comEmpresa(caso) ? comEmpresa(caso).replace(" da ", " a ") : " vocês"} conosco.\n\nPróximo passo: ${caso.assunto.trim() || "vamos agendar a reunião inicial para alinhar escopo e prazos"}.${trechoPrazo(caso)}\n\nQualquer dúvida no caminho, fale comigo direto.`,
          1,
        ),
        monta(
          "Alinhando o que esperar",
          "Como vamos trabalhar",
          `${s}, tudo bem?\n\nPara começarmos bem, o combinado do nosso lado:\n\n- Ponto de contato: eu, direto, sem intermediário.\n- Retorno em até um dia útil.\n- Atualização de andamento periódica, mesmo quando não houver novidade.\n\nDo lado de vocês, o que mais ajuda é ${caso.assunto.trim() || "termos um interlocutor definido para as pendências"}.\n\nFaz sentido assim?`,
          2,
        ),
        monta(
          "Check-in depois do começo",
          "Como está sendo até aqui?",
          `${s}, tudo bem?\n\nPassando para saber como está sendo o início do trabalho ${assunto}.\n\nSe houver algo travando ou que possamos fazer diferente, é melhor ajustar agora do que no fim. Tem 15 minutos esta semana?`,
          3,
        ),
      ];

    default:
      return [];
  }
}

/** Corta a mensagem no limite do canal, avisando quando passou. */
export function excedeCanal(msg: Mensagem, canal: Canal): boolean {
  const limite = CANAIS.find((c) => c.id === canal)?.limite || 9999;
  return msg.corpo.length > limite;
}
