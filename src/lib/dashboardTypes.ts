// Forma do dashboard_state.
//
// O estado é um JSON só, gravado inteiro numa linha do Supabase, e foi crescendo
// sem tipo. Estes tipos descrevem o que o código lê hoje; a assinatura de índice
// em cada um preserva os campos que outras partes gravam e que não interessam
// aqui — riskAssessment, dadosEmpresa, sourceAtaId, tasksGeradas — para que
// nenhuma escrita por espalhamento os perca.

export type Comentario = {
  id: string;
  text: string;
  autor_id: string | null;
  autor_nome: string;
  created_at?: string;
  date?: string;
  tipo?: string;
  /** Semana do acompanhamento automático, quando for um. */
  semanaAcompanhamento?: string;
  [k: string]: unknown;
};

export type ItemChecklist = {
  id: string;
  text: string;
  done: boolean;
  [k: string]: unknown;
};

export type Etiqueta = {
  id: string;
  label: string;
  color: string;
  [k: string]: unknown;
};

export type Transicao = {
  de: string;
  para: string;
  em: string;
};

export type Anexo = {
  id: string;
  name?: string;
  /** Caminho no bucket privado. Ausente em anexos que são só link. */
  caminho?: string;
  url?: string;
  tamanho?: number;
  tipo?: string;
  [k: string]: unknown;
};

export type Item = {
  id: string;
  name: string;
  tipo?: string;
  /** Status antigo, de 5 valores. Mantido por compatibilidade. */
  status?: string;
  /** Status atual, das 7 colunas do Kanban. */
  kanbanStatus?: string;
  responsaveis?: string[];
  responsavel?: string;
  prazo?: string;
  dataInicio?: string;
  criadoEm?: string;
  statusChangedAt?: string;
  statusHistory?: Transicao[];
  comentarios?: Comentario[];
  checklist?: ItemChecklist[];
  etiquetas?: Etiqueta[];
  anexos?: Anexo[];
  obs?: string;
  descricao?: string;
  acompanhamentoSemanal?: boolean;
  templateId?: string;
  [k: string]: unknown;
};

export type Plano = {
  id: string;
  name: string;
  items?: Item[];
  notas?: unknown[];
  [k: string]: unknown;
};

export type Cliente = {
  id: string;
  name: string;
  planos?: Plano[];
  [k: string]: unknown;
};

export type Area = {
  id: string;
  name?: string;
  clientes?: Cliente[];
  [k: string]: unknown;
};

/** Produto guarda itens num nível só: faz papel de cliente e de plano. */
export type Produto = {
  id: string;
  name: string;
  items?: Item[];
  notas?: unknown[];
  [k: string]: unknown;
};

export type DashboardState = {
  areas?: Area[];
  produtos?: Produto[];
  templates?: unknown[];
  updates?: unknown[];
  [k: string]: unknown;
};
