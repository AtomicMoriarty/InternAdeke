// Registro central das áreas (quadros). Adicionar uma área nova aqui a propaga
// para a sidebar, o Quadro Geral, as notificações e os templates.

export type AreaDef = {
  id: string;
  name: string;      // nome exibido na sidebar e nos cabeçalhos
  modulo: string;    // rótulo curto usado em notificações e nos cards
  color: string;     // cor da área na interface
  cardColor: string; // cor da faixa lateral do card no Quadro Geral
  icon: "shield" | "lock" | "stamp" | "scale" | "handshake";
};

export const AREAS: AreaDef[] = [
  { id: "compliance", name: "Compliance & Ética", modulo: "Compliance", color: "#0DD3C5", cardColor: "#8B5CF6", icon: "shield" },
  { id: "lgpd",       name: "LGPD & Privacidade", modulo: "LGPD",       color: "#06C8D9", cardColor: "#EF4444", icon: "lock" },
  { id: "inpi",       name: "INPI & Marcas",      modulo: "INPI",       color: "#F59E0B", cardColor: "#F59E0B", icon: "stamp" },
  { id: "societario", name: "Societário",         modulo: "Societário", color: "#8B5CF6", cardColor: "#6366F1", icon: "scale" },
  { id: "comercial",  name: "Comercial",          modulo: "Comercial",  color: "#EC4899", cardColor: "#EC4899", icon: "handshake" },
];

export const AREA_IDS = AREAS.map((a) => a.id);

export function areaById(id: string): AreaDef | undefined {
  return AREAS.find((a) => a.id === id);
}

export function moduloOf(areaId: string): string {
  return areaById(areaId)?.modulo || "Produtos";
}

// "Produtos" nao e uma area: e o array data.produtos, paralelo a data.areas.
// Aparece no Quadro Geral como se fosse um modulo, entao precisa de cor propria.
export const MODULO_PRODUTOS = "Produtos";

export const MODULO_COLOR: Record<string, string> = {
  ...Object.fromEntries(AREAS.map((a) => [a.modulo, a.cardColor])),
  [MODULO_PRODUTOS]: "#8B5CF6",
};

/** Todos os rotulos de modulo que podem aparecer no Quadro Geral. */
export const MODULOS = [...AREAS.map((a) => a.modulo), MODULO_PRODUTOS];

// ─── Demandas pré-listadas por área ──────────────────────────────────────────
// Alimentam a lista suspensa do formulário de novo item. "Outro" sempre permite
// escrever à mão.
export const DEMANDAS_POR_AREA: Record<string, string[]> = {
  compliance: [
    "Código de Conduta", "Política Anticorrupção", "Risk Assessment",
    "Treinamento", "Due Diligence de Terceiros", "Canal de Ética",
    "Auditoria", "Relatório de Monitoramento",
  ],
  lgpd: [
    "Mapeamento de Dados", "Política de Privacidade", "Relatório de Impacto",
    "Treinamento", "Gerenciamento de Incidentes", "Solicitação de Titular",
    "Revisão de Contratos", "Adequação de Site",
  ],
  inpi: [
    "Depósito de marca", "Busca de anterioridade", "Resposta a exigência",
    "Oposição", "Recurso", "Renovação", "Petição", "Acompanhamento de processo",
  ],
  societario: [
    "Alteração contratual", "Constituição de empresa", "Distrato",
    "Ata de assembleia", "Procuração", "Certidões", "Registro na Junta",
  ],
  comercial: [
    "Proposta comercial", "Contrato de prestação", "Renovação de contrato",
    "Reunião de prospecção", "Follow-up", "Cobrança",
  ],
};

// ─── Checklists automáticas por demanda ──────────────────────────────────────
// Ao criar um item cuja demanda bate com uma chave aqui, a checklist já vem
// preenchida.
export const CHECKLIST_POR_DEMANDA: Record<string, string[]> = {
  "Depósito de marca": [
    "Busca de anterioridade", "Definição de classe (NICE)", "Emissão da GRU",
    "Pagamento da GRU", "Protocolo do pedido", "Registro do número do processo",
  ],
  "Resposta a exigência": [
    "Ler a exigência publicada na RPI", "Levantar documentação",
    "Redigir resposta", "Emitir e pagar GRU", "Protocolar", "Confirmar recebimento",
  ],
  "Renovação": [
    "Conferir prazo de vigência", "Emitir GRU de renovação",
    "Pagamento", "Protocolo", "Confirmar deferimento",
  ],
  "Alteração contratual": [
    "Levantar documentos societários", "Minutar alteração",
    "Colher assinaturas", "Protocolar na Junta", "Obter certidão atualizada",
  ],
  "Constituição de empresa": [
    "Consulta de viabilidade", "Definir objeto social e capital",
    "Minutar contrato social", "Colher assinaturas", "Registro na Junta",
    "CNPJ", "Inscrições municipais/estaduais",
  ],
  "Proposta comercial": [
    "Levantar escopo com o cliente", "Definir precificação",
    "Redigir proposta", "Enviar ao cliente", "Follow-up", "Registrar desfecho",
  ],
  "Risk Assessment": [
    "Mapeamento das atividades", "Classificação de risco",
    "Sugestão de melhorias", "Validação com o cliente",
  ],
  "Mapeamento de Dados": [
    "Entrevistas por área", "Preencher planilha de mapeamento",
    "Desenhar fluxo de tratamento", "Identificar bases legais", "Mapear riscos",
  ],
  "Treinamento": [
    "Preparar material", "Agendar sessão", "Realizar treinamento",
    "Coletar lista de presença", "Emitir certificados",
  ],
};

export function checklistTemplateFor(demanda: string): string[] {
  return CHECKLIST_POR_DEMANDA[demanda] || [];
}

// ─── Modulos visiveis por pessoa ─────────────────────────────────────────────

/** Tudo que pode ser liberado: as areas mais o pseudo-modulo Produtos. */
export const ALL_MODULES = [...AREA_IDS, "produtos"];

/**
 * Conjunto que significava "acesso total" antes de INPI, Societario e Comercial
 * existirem. Perfis salvos naquela epoca tem exatamente estes tres.
 */
const MODULOS_LEGADOS = ["compliance", "lgpd", "produtos"];

/**
 * Quais quadros a pessoa enxerga.
 *
 * Quem tinha acesso total continua tendo quando um quadro novo nasce. Sem isso,
 * criar uma area a esconde de todo mundo ate alguem editar perfil por perfil —
 * e o sintoma engana: a barra lateral mostra o quadro por um instante, enquanto
 * o perfil ainda nao carregou, e depois o esconde.
 */
export function allowedModulesFor(profile: any): string[] {
  const salvos = profile?.allowed_modules;
  if (!Array.isArray(salvos) || !salvos.length) return ALL_MODULES;
  if (MODULOS_LEGADOS.every((m) => salvos.includes(m))) return ALL_MODULES;
  return salvos;
}
