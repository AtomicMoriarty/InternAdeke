// @ts-nocheck
import { useState, useRef, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  Shield,
  Lock,
  Rocket,
  Home,
  CheckCircle,
  Clock,
  AlertCircle,
  PauseCircle,
  MinusCircle,
  Plus,
  ArrowLeft,
  Activity,
  ChevronRight,
  TrendingUp,
  Trash2,
  User,
  Building2,
  FolderOpen,
  StickyNote,
  Info,
  X,
  Edit3,
  ArrowUp,
  ArrowDown,
  MessageSquare,
  LayoutDashboard,
  Stamp,
  Scale,
  Handshake,
  BarChart3,
} from "lucide-react";
import ResponsaveisPicker from "@/components/ResponsaveisPicker";
import MentionTextarea, { MentionText, extractMentions } from "@/components/MentionTextarea";
import Relatorios from "@/components/Relatorios";
import {
  AREAS, AREA_IDS, ALL_MODULES, allowedModulesFor,
  moduloOf as moduloOfArea, DEMANDAS_POR_AREA, checklistTemplateFor,
} from "@/lib/areas";
import { useProfiles, initials, colorFor } from "@/lib/profiles";
import { emitNotifications, emitAtribuicao, emitMudancaStatus } from "@/lib/notifications";
import { useCurrentUser } from "@/lib/useCurrentUser";
import QuadroGeral from "@/components/QuadroGeral";
import ItemModal from "@/components/ItemModal";
import { useDeadlineCheck } from "@/hooks/useDeadlineCheck";

const AREA_ICONS = { shield: Shield, lock: Lock, stamp: Stamp, scale: Scale, handshake: Handshake };

function moduloOf(areaId) {
  return moduloOfArea(areaId);
}
function ResponsaveisAvatars({ ids }) {
  const profiles = useProfiles();
  const sel = (ids || []).map((id) => profiles.find((p) => p.id === id)).filter(Boolean);
  if (!sel.length) return <span style={{ color: "#94A3B8", fontSize: 11 }}>—</span>;
  return (
    <span style={{ display: "inline-flex" }}>
      {sel.slice(0, 4).map((p, i) => (
        <span
          key={p.id}
          title={p.display_name}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: p.avatar_color || colorFor(p.id),
            color: "#fff",
            fontSize: 9,
            fontWeight: 800,
            marginLeft: i === 0 ? 0 : -6,
            border: "1.5px solid #fff",
          }}
        >
          {initials(p.display_name)}
        </span>
      ))}
      {sel.length > 4 && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "#64748B",
            color: "#fff",
            fontSize: 9,
            fontWeight: 800,
            marginLeft: -6,
            border: "1.5px solid #fff",
          }}
        >
          +{sel.length - 4}
        </span>
      )}
    </span>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────
// ── Unified Kanban statuses – shared with ItemModal and QuadroGeral ─────────
const KANBAN_COLUMNS_DASH = [
  "A Fazer",
  "Em Andamento",
  "Pendência Interna",
  "Pendência Cliente",
  "Monitoramento",
  "Finalizado",
  "Suspenso",
] as const;
type KanbanStatusDash = (typeof KANBAN_COLUMNS_DASH)[number];

const STATUS_META: Record<string, { color: string; bg: string; icon: any }> = {
  "A Fazer": { color: "#64748B", bg: "#F8FAFC", icon: MinusCircle },
  "Em Andamento": { color: "#3B82F6", bg: "#EFF6FF", icon: Clock },
  "Pendência Interna": { color: "#F59E0B", bg: "#FFFBEB", icon: AlertCircle },
  "Pendência Cliente": { color: "#F97316", bg: "#FFF7ED", icon: PauseCircle },
  Monitoramento: { color: "#06B6D4", bg: "#ECFEFF", icon: Activity },
  Finalizado: { color: "#10B981", bg: "#ECFDF5", icon: CheckCircle },
  Suspenso: { color: "#94A3B8", bg: "#F8FAFC", icon: PauseCircle },
};
const STATUS_ORDER = KANBAN_COLUMNS_DASH as unknown as string[];

/** Derives a unified KanbanStatus from an item, handling legacy status values */
function getItemKanbanStatus(item: any): string {
  if (item.kanbanStatus && STATUS_META[item.kanbanStatus]) return item.kanbanStatus;
  const s = item.status;
  if (s === "Concluído") return "Finalizado";
  if (s === "Em andamento") return "Em Andamento";
  if (s === "Pausado") return "Suspenso";
  if (s === "Planejamento") return "Pendência Interna";
  return "A Fazer";
}
const TIPOS_ITEM = [
  "Organograma",
  "Política",
  "Procedimento",
  "Processo",
  "Treinamento",
  "Relatório",
  "Auditoria",
  "Documento",
  "Outro",
];

function uid() {
  return `_${Math.random().toString(36).slice(2, 9)}`;
}

const RISK_QUESTIONS = [
  {
    id: "gov-atas",
    assunto: "Governanca e atas",
    pergunta:
      "As reunioes e decisoes relevantes possuem atas, responsaveis e encaminhamentos formalizados?",
    area: "Governanca",
    tipoRisco: "Governanca",
    importancia: "Alta",
    keywords: ["reuniao", "ata", "deliberacao", "comite", "decisao", "encaminhamento"],
    sugestao: "Formalizar atas de reuniao com decisoes, responsaveis, prazos e evidencias.",
    planoAcao: "Criar modelo de ata e rotina de registro/aprovacao das reunioes criticas.",
  },
  {
    id: "comp-codigo",
    assunto: "Codigo de conduta",
    pergunta: "Existe codigo de conduta aprovado, divulgado e aceito pelos colaboradores?",
    area: "Compliance",
    tipoRisco: "Compliance",
    importancia: "Alta",
    keywords: ["codigo de conduta", "etica", "conduta", "integridade", "colaborador"],
    sugestao: "Atualizar ou criar codigo de conduta e registrar ciencia dos colaboradores.",
    planoAcao: "Revisar codigo, aprovar com a direcao e coletar aceite da equipe.",
  },
  {
    id: "comp-canal",
    assunto: "Canal de etica",
    pergunta: "Ha canal de etica/denuncia com fluxo de tratamento, confidencialidade e registro?",
    area: "Compliance",
    tipoRisco: "Canal de Etica",
    importancia: "Alta",
    keywords: ["canal de etica", "denuncia", "relato", "confidencial", "ouvidoria"],
    sugestao: "Implantar canal de etica com procedimento de triagem, investigacao e registro.",
    planoAcao: "Definir canal, responsaveis, SLA e fluxo de investigacao das ocorrencias.",
  },
  {
    id: "licitacoes-checklist",
    assunto: "Licitacoes e contratos publicos",
    pergunta:
      "A participacao em licitacoes possui checklist de edital, precificacao, documentacao e aprovacoes?",
    area: "Comercial",
    tipoRisco: "Licitacoes",
    importancia: "Alta",
    keywords: ["licitacao", "edital", "pregao", "contrato publico", "proposta", "precificacao"],
    sugestao:
      "Criar checklist de conformidade para edital, habilitacao, precificacao e aprovacoes.",
    planoAcao: "Padronizar analise de edital e validacao juridica/compliance antes de cada envio.",
  },
  {
    id: "ti-backup",
    assunto: "Seguranca da informacao",
    pergunta:
      "Os documentos e dados criticos possuem backup, controle de acesso e armazenamento seguro?",
    area: "TI",
    tipoRisco: "Seguranca da Informacao",
    importancia: "Alta",
    keywords: ["servidor", "backup", "nuvem", "drive", "acesso", "senha", "documentos", "arquivo"],
    sugestao: "Migrar ou organizar armazenamento seguro, backup periodico e controle de acessos.",
    planoAcao:
      "Mapear repositorios, revisar permissoes e criar rotina de backup e auditoria de acesso.",
  },
  {
    id: "lgpd-dados",
    assunto: "Dados pessoais e retencao",
    pergunta: "Dados pessoais, documentos fisicos e prazos de retencao/descarte estao mapeados?",
    area: "LGPD",
    tipoRisco: "Privacidade",
    importancia: "Media",
    keywords: ["dados pessoais", "cpf", "rg", "lgpd", "documento fisico", "retencao", "descarte"],
    sugestao: "Mapear dados pessoais, bases legais, locais de armazenamento e prazos de retencao.",
    planoAcao: "Criar inventario de dados e tabela de retencao/descarte por tipo documental.",
  },
  {
    id: "terceiros",
    assunto: "Terceiros e prestadores",
    pergunta:
      "Terceiros criticos possuem due diligence, contrato e regras de confidencialidade/protecao de dados?",
    area: "Juridico",
    tipoRisco: "Terceiros",
    importancia: "Media",
    keywords: [
      "terceiro",
      "prestador",
      "contador",
      "contabilidade",
      "fornecedor",
      "operador",
      "dpa",
    ],
    sugestao:
      "Implementar due diligence de terceiros e revisar contratos com clausulas obrigatorias.",
    planoAcao: "Classificar terceiros por risco e solicitar documentos/contratos pendentes.",
  },
  {
    id: "politicas",
    assunto: "Politicas internas",
    pergunta:
      "As politicas internas possuem versao, aprovacao, responsavel, validade e evidencia de divulgacao?",
    area: "Compliance",
    tipoRisco: "Documentos e Politicas",
    importancia: "Media",
    keywords: ["politica", "procedimento", "norma interna", "manual", "versao", "aprovacao"],
    sugestao:
      "Criar matriz de politicas com responsavel, revisao, aprovacao e evidencia de comunicacao.",
    planoAcao: "Levantar politicas existentes e priorizar criacao/revisao das obrigatorias.",
  },
  {
    id: "regulatorio-bcb",
    assunto: "Base normativa e regulatorio",
    pergunta:
      "As obrigacoes regulatorias aplicaveis estao mapeadas em base normativa com plano de acao e status?",
    area: "Regulatorio",
    tipoRisco: "Regulatorio",
    importancia: "Alta",
    keywords: ["banco central", "bcb", "pix", "resolucao", "circular", "unicad", "normativo"],
    sugestao:
      "Consolidar base normativa aplicavel e controlar gaps por prioridade, responsavel e status.",
    planoAcao:
      "Montar matriz regulatoria com base normativa, descricao, plano de acao, prioridade e status.",
  },
  {
    id: "treinamento",
    assunto: "Treinamentos",
    pergunta:
      "Existe trilha de treinamento e evidencia de participacao para temas de compliance, LGPD e seguranca?",
    area: "RH",
    tipoRisco: "Treinamento",
    importancia: "Media",
    keywords: ["treinamento", "capacitacao", "colaborador", "onboarding", "reciclagem"],
    sugestao: "Criar matriz de treinamentos obrigatorios e evidencias de participacao.",
    planoAcao: "Definir conteudo, periodicidade, publico-alvo e controle de presenca.",
  },
];

const POSITIVE_RISK_WORDS = [
  "tem",
  "existe",
  "possuimos",
  "formalizado",
  "aprovado",
  "implementado",
  "registrado",
  "fazemos",
  "controlamos",
];
const NEGATIVE_RISK_WORDS = [
  "nao",
  "sem",
  "nunca",
  "falta",
  "pendente",
  "informal",
  "precisa",
  "nao temos",
  "nao possui",
  "nao existe",
];

function normalizeRiskText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isRiskAssessmentPlan(plano) {
  const name = normalizeRiskText(plano?.name || "");
  return name.includes("risk assessment") || name.includes("risco") || name.includes("assessment");
}

function inferRiskAnswer(text, question) {
  const source = normalizeRiskText(text);
  const hit = question.keywords.some((keyword) => source.includes(normalizeRiskText(keyword)));
  if (!hit) return null;
  const hasNegative = NEGATIVE_RISK_WORDS.some((word) => source.includes(normalizeRiskText(word)));
  const hasPositive = POSITIVE_RISK_WORDS.some((word) => source.includes(normalizeRiskText(word)));
  if (hasNegative) return "N";
  if (hasPositive) return "P";
  return "P";
}

function riskRowFromQuestion(question, atende = "P", origem = "Questionario") {
  return {
    id: `risk${uid()}`,
    sourceId: question.id,
    origem,
    assunto: question.assunto,
    atividade: question.pergunta,
    area: question.area,
    atende,
    tipoRisco: question.tipoRisco,
    sugestao: question.sugestao,
    planoAcao: question.planoAcao,
    importancia: question.importancia,
    status: "Nao iniciado",
    evidencia: "",
  };
}

function generateRiskRowsFromTranscript(transcript = "") {
  const rows = [];
  RISK_QUESTIONS.forEach((question) => {
    const atende = inferRiskAnswer(transcript, question);
    if (!atende) return;
    rows.push(riskRowFromQuestion(question, atende, "Transcricao"));
  });
  if (!rows.length && transcript.trim()) {
    rows.push({
      id: `risk${uid()}`,
      sourceId: "geral",
      origem: "Transcricao",
      assunto: "Diagnostico geral",
      atividade: "Transcricao recebida sem tema automaticamente identificado.",
      area: "Compliance",
      atende: "P",
      tipoRisco: "Diagnostico",
      sugestao: "Revisar a transcricao manualmente e classificar os gaps relevantes.",
      planoAcao:
        "Complementar o questionario e transformar os pontos relevantes em itens do plano.",
      importancia: "Media",
      status: "Nao iniciado",
      evidencia: transcript.slice(0, 240),
    });
  }
  return rows;
}

function summarizeRiskRows(rows = []) {
  const actionable = rows.filter((r) => r.atende !== "S");
  const high = actionable.filter((r) => r.importancia === "Alta").length;
  const medium = actionable.filter((r) => r.importancia === "Media").length;
  const byType = actionable.reduce((acc, r) => {
    acc[r.tipoRisco] = (acc[r.tipoRisco] || 0) + 1;
    return acc;
  }, {});
  const answered = rows.length;
  const ok = rows.filter((r) => r.atende === "S").length;
  const pct = answered ? Math.round((ok / answered) * 100) : 0;
  return { total: actionable.length, high, medium, pct, byType };
}

// ─── Initial Data ─────────────────────────────────────────────────────────────
const INIT = {
  areas: [
    {
      id: "compliance",
      name: "Compliance & Ética",
      color: "#0DD3C5",
      responsavel: "",
      clientes: [],
    },
    {
      id: "lgpd",
      name: "LGPD & Privacidade",
      color: "#06C8D9",
      responsavel: "",
      dpo: "",
      clientes: [],
    },
    { id: "inpi", name: "INPI & Marcas", color: "#F59E0B", responsavel: "", responsaveis: [], clientes: [] },
    { id: "societario", name: "Societário", color: "#8B5CF6", responsavel: "", responsaveis: [], clientes: [] },
    { id: "comercial", name: "Comercial", color: "#EC4899", responsavel: "", responsaveis: [], clientes: [] },
  ],
  produtos: [
    {
      id: "financeiro",
      name: "Produto Financeiro",
      emoji: "📊",
      color: "#8B5CF6",
      responsavel: "",
      descricao: "Solução financeira em elaboração",
      items: [
        { id: "f1", name: "Definição de escopo e MVP", status: "Em andamento", prazo: "", obs: "" },
        {
          id: "f2",
          name: "Análise de mercado e benchmarking",
          status: "Planejamento",
          prazo: "",
          obs: "",
        },
        {
          id: "f3",
          name: "Desenvolvimento da solução",
          status: "Não iniciado",
          prazo: "",
          obs: "",
        },
        { id: "f4", name: "Testes e validação", status: "Não iniciado", prazo: "", obs: "" },
        { id: "f5", name: "Homologação regulatória", status: "Não iniciado", prazo: "", obs: "" },
        { id: "f6", name: "Go-to-market e lançamento", status: "Não iniciado", prazo: "", obs: "" },
        { id: "f7", name: "Pós-venda e suporte", status: "Não iniciado", prazo: "", obs: "" },
        {
          id: "f8",
          name: "Métricas e KPIs de desempenho",
          status: "Não iniciado",
          prazo: "",
          obs: "",
        },
      ],
      notas: [],
      informacoes: [],
    },
    {
      id: "proposta",
      name: "Proposta",
      emoji: "📄",
      color: "#06B6D4",
      responsavel: "",
      descricao: "Produto de gestão de propostas comerciais",
      items: [
        { id: "p1", name: "Definição de escopo e MVP", status: "Em andamento", prazo: "", obs: "" },
        { id: "p2", name: "Modelagem do produto", status: "Planejamento", prazo: "", obs: "" },
        { id: "p3", name: "Desenvolvimento", status: "Não iniciado", prazo: "", obs: "" },
        { id: "p4", name: "Testes e validação", status: "Não iniciado", prazo: "", obs: "" },
        {
          id: "p5",
          name: "Piloto com clientes selecionados",
          status: "Não iniciado",
          prazo: "",
          obs: "",
        },
        { id: "p6", name: "Lançamento comercial", status: "Não iniciado", prazo: "", obs: "" },
        { id: "p7", name: "Métricas e KPIs", status: "Não iniciado", prazo: "", obs: "" },
        { id: "p8", name: "Evoluções pós-lançamento", status: "Não iniciado", prazo: "", obs: "" },
      ],
      notas: [],
      informacoes: [],
    },
    {
      id: "contractia",
      name: "Contract.IA",
      emoji: "📑",
      color: "#10B981",
      responsavel: "",
      descricao: "Gestão inteligente da vida útil de contratos",
      items: [
        {
          id: "ci1",
          name: "Mapeamento da vida útil do contrato",
          status: "Em andamento",
          prazo: "",
          obs: "",
        },
        {
          id: "ci2",
          name: "Definição de funcionalidades core",
          status: "Em andamento",
          prazo: "",
          obs: "",
        },
        {
          id: "ci3",
          name: "Arquitetura e tecnologia de IA",
          status: "Planejamento",
          prazo: "",
          obs: "",
        },
        {
          id: "ci4",
          name: "Módulo de criação de contratos",
          status: "Planejamento",
          prazo: "",
          obs: "",
        },
        {
          id: "ci5",
          name: "Módulo de gestão e alertas",
          status: "Não iniciado",
          prazo: "",
          obs: "",
        },
        {
          id: "ci6",
          name: "Módulo de renovação e encerramento",
          status: "Não iniciado",
          prazo: "",
          obs: "",
        },
        {
          id: "ci7",
          name: "Integrações com sistemas externos",
          status: "Não iniciado",
          prazo: "",
          obs: "",
        },
        {
          id: "ci8",
          name: "Testes, homologação e lançamento",
          status: "Não iniciado",
          prazo: "",
          obs: "",
        },
      ],
      notas: [],
      informacoes: [],
    },
    {
      id: "crivo",
      name: "Crivo",
      emoji: "🔍",
      color: "#F59E0B",
      responsavel: "",
      descricao: "Análise de fornecedores e Reforma Tributária",
      items: [
        {
          id: "cr1",
          name: "Mapeamento do processo de fornecedores",
          status: "Planejamento",
          prazo: "",
          obs: "",
        },
        {
          id: "cr2",
          name: "Análise de impacto da Reforma Tributária",
          status: "Planejamento",
          prazo: "",
          obs: "",
        },
        {
          id: "cr3",
          name: "Definição de critérios de avaliação",
          status: "Planejamento",
          prazo: "",
          obs: "",
        },
        {
          id: "cr4",
          name: "Desenvolvimento do motor de análise",
          status: "Não iniciado",
          prazo: "",
          obs: "",
        },
        {
          id: "cr5",
          name: "Integração com bases externas",
          status: "Não iniciado",
          prazo: "",
          obs: "",
        },
        {
          id: "cr6",
          name: "Módulo de relatórios e dashboards",
          status: "Não iniciado",
          prazo: "",
          obs: "",
        },
        {
          id: "cr7",
          name: "Piloto com empresas parceiras",
          status: "Não iniciado",
          prazo: "",
          obs: "",
        },
        {
          id: "cr8",
          name: "Lançamento e roadmap de evoluções",
          status: "Não iniciado",
          prazo: "",
          obs: "",
        },
      ],
      notas: [],
      informacoes: [],
    },
    {
      id: "canal-etica",
      name: "Canal de Ética",
      emoji: "🛡️",
      color: "#EC4899",
      responsavel: "",
      descricao: "Canal confidencial de denúncias e ética corporativa",
      isCanalEtica: true,
      items: [
        {
          id: "ce1",
          name: "Definição de escopo e canais de recebimento",
          status: "Não iniciado",
          prazo: "",
          obs: "",
        },
        {
          id: "ce2",
          name: "Política do canal e código de conduta",
          status: "Não iniciado",
          prazo: "",
          obs: "",
        },
        {
          id: "ce3",
          name: "Desenvolvimento da plataforma/tecnologia",
          status: "Não iniciado",
          prazo: "",
          obs: "",
        },
        {
          id: "ce4",
          name: "Treinamento e comunicação interna",
          status: "Não iniciado",
          prazo: "",
          obs: "",
        },
        { id: "ce5", name: "Piloto e homologação", status: "Não iniciado", prazo: "", obs: "" },
        {
          id: "ce6",
          name: "Lançamento e operação contínua",
          status: "Não iniciado",
          prazo: "",
          obs: "",
        },
      ],
      notas: [],
      informacoes: [],
    },
  ],
  updates: [
    {
      id: "u0",
      date: "11/05/2026",
      area: "Geral",
      texto: "Plataforma de gestão Adeke iniciada.",
      autor: "Equipe Adeke",
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function prog(items) {
  const total = items.length,
    done = items.filter((i) => getItemKanbanStatus(i) === "Finalizado").length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}
function areaProg(area) {
  const items = area.clientes.flatMap((c) => c.planos.flatMap((p) => p.items));
  return prog(items);
}

// ─── Templates por área ──────────────────────────────────────────────────────
// Bancos ja existentes foram criados quando so havia duas areas. Sem isto os
// quadros novos nunca apareceriam para quem ja usa o sistema.
function ensureAreas(data) {
  if (!data || !Array.isArray(data.areas)) return data;
  const existentes = new Set(data.areas.map((a) => a.id));
  const faltando = AREAS.filter((a) => !existentes.has(a.id)).map((a) => ({
    id: a.id, name: a.name, color: a.color,
    responsavel: "", responsaveis: [],
    ...(a.id === "lgpd" ? { dpo: "" } : {}),
    clientes: [],
  }));
  if (!faltando.length) return data;
  const porId = new Map([...data.areas, ...faltando].map((a) => [a.id, a]));
  const ordenadas = AREAS.map((a) => porId.get(a.id)).filter(Boolean);
  const extras = data.areas.filter((a) => !AREAS.some((x) => x.id === a.id));
  return { ...data, areas: [...ordenadas, ...extras] };
}

const TEMPLATES = {
  inpi: [
    { name: "Dados da empresa", items: ["Contato", "Dados da empresa"] },
    { name: "Marcas em andamento", items: [] },
    { name: "Marcas registradas", items: [] },
    { name: "Prazos e vigências", items: [] },
  ],
  societario: [
    { name: "Dados da empresa", items: ["Contato", "Dados da empresa", "Quadro societário"] },
    { name: "Documentos societários", items: ["Contrato social vigente", "Última alteração", "Certidão simplificada"] },
    { name: "Demandas em andamento", items: [] },
  ],
  comercial: [
    { name: "Dados do cliente", items: ["Contato", "Dados da empresa"] },
    { name: "Propostas", items: [] },
    { name: "Contratos", items: [] },
    { name: "Follow-up", items: [] },
  ],
  lgpd: [
    {
      name: "Dados da empresa",
      items: ["Contato", "Dados da empresa", "Dados de prestadores de serviços"],
    },
    { name: "Atas de Reuniões", items: [] },
    { name: "Reuniões Semanais do P&P", items: [] },
    {
      name: "Mobilização Inicial",
      items: [
        "Kickoff do Programa",
        "Definição DPO",
        "Treinamento Inicial",
        "Comitê de Proteção de Dados",
        "Política de Privacidade e Proteção de Dados Inicial",
        "Revisão do Site",
        "Organograma",
      ],
    },
    {
      name: "Mapeamento e Classificação",
      items: [
        "Análise de Gaps e Recomendações",
        "Fluxo de Tratamento de Dados",
        "Planilha de Mapeamento",
        "Mapeamento de Riscos",
      ],
    },
    { name: "Terceiros (Operadores)", items: ["TO DO", "Empresa de Contabilidade"] },
    {
      name: "Documentos Jurídicos",
      items: [
        "Política de Privacidade Final",
        "Contrato de Trabalho – Auxiliar Administrativo",
        "Contrato de Trabalho – Advogados",
        "Política Interna",
        "Termos de Consentimento",
        "Disclaimer de E-mails Corporativos",
        "Contrato de Honorários",
        "Termo de Compromisso de Estágio",
      ],
    },
    {
      name: "Governança",
      items: [
        "Gerenciamento de Incidentes",
        "Gerenciamento de Solicitação de Titulares",
        "Relatório de Impacto",
        "Treinamento Final",
        "Relatório Final",
      ],
    },
  ],
  compliance: [
    { name: "Dados da empresa", items: ["Contato", "Dados da empresa"] },
    { name: "Atas de Reuniões Externas", items: [] },
    { name: "Atas de Reuniões Internas", items: [] },
    {
      name: "Risk Assessment",
      items: ["Mapeamento das Atividades", "Classificação de Risco", "Sugestão de Melhorias"],
    },
    { name: "Código de Conduta", items: ["Código de Conduta"] },
    {
      name: "Políticas",
      items: [
        "Política Anticorrupção",
        "Política de Brindes, Presentes e Hospitalidades",
        "Política de Conflito de Interesses",
        "Política de Doações e Patrocínios",
        "Política de Due Diligence de Terceiros",
        "Política de Compliance Concorrencial",
        "Política de Prevenção à Lavagem de Dinheiro",
        "Política de Consequências",
      ],
    },
    {
      name: "Documentos e Termos",
      items: [
        "Termo de Confidencialidade",
        "Termo de Imagem e Voz",
        "Termo de Comodato Equipamentos",
        "Termo de Comodato Veículos",
        "Termo de Uso – Website",
      ],
    },
    { name: "Canais", items: ["Canal de Ética", "Ouvidoria"] },
    { name: "Treinamento", items: ["Treinamento", "Emissão de Certificado"] },
    {
      name: "Revisão Final",
      items: [
        "Repasse Programa de Integridade",
        "Auditoria",
        "Relatório de Monitoramento",
        "Revisão Final do Programa",
      ],
    },
  ],
};
function buildTemplatePlanos(areaId) {
  const t = (TEMPLATES[areaId] || []).filter((p) => p.name !== "Dados da empresa");
  return t.map((p) => ({
    id: `pl${uid()}`,
    name: p.name,
    responsavel: "",
    notas: [],
    items: p.items.map((n) => ({
      id: `it${uid()}`,
      name: n,
      tipo: "Documento",
      responsavel: "",
      status: "Não iniciado",
      kanbanStatus: "Suspenso",
      obs: "",
      prazo: "",
    })),
  }));
}

// Stable: completed go to the end, preserving order within each group
function sortItemsByCompletion(items) {
  const open = items.filter((i) => getItemKanbanStatus(i) !== "Finalizado");
  const done = items.filter((i) => getItemKanbanStatus(i) === "Finalizado");
  return [...open, ...done];
}
function planoIsDone(p) {
  return p.items.length > 0 && p.items.every((i) => getItemKanbanStatus(i) === "Finalizado");
}
function sortPlanosByCompletion(planos) {
  const open = planos.filter((p) => !planoIsDone(p));
  const done = planos.filter((p) => planoIsDone(p));
  return [...open, ...done];
}
function moveInArray(arr, idx, dir) {
  const j = idx + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[idx], next[j]] = [next[j], next[idx]];
  return next;
}
function reorderById(arr, sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return arr;
  const from = arr.findIndex((x) => x.id === sourceId);
  const to = arr.findIndex((x) => x.id === targetId);
  if (from < 0 || to < 0) return arr;
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
function todayBR() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// ─── Primitives ───────────────────────────────────────────────────────────────
function Ring({ pct, color, size = 80, stroke = 8 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", display: "block" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.9s ease" }}
      />
    </svg>
  );
}

function Bar2({ pct, color }) {
  return (
    <div style={{ background: "#E2E8F0", borderRadius: 4, height: 6 }}>
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 4,
          transition: "width 0.7s ease",
        }}
      />
    </div>
  );
}

function StatusPill({ status, onChange }: { status: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const resolved = STATUS_META[status] ? status : getItemKanbanStatus({ status });
  const m = STATUS_META[resolved] || STATUS_META["A Fazer"];
  const Icon = m.icon;
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "6px 14px",
          borderRadius: 20,
          border: `1.5px solid ${m.color}50`,
          background: m.bg,
          color: m.color,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          boxShadow: `0 1px 4px ${m.color}20`,
        }}
      >
        <Icon size={13} /> {resolved}
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 999,
            background: "#FFFFFF",
            border: "1px solid #E2E8F0",
            borderRadius: 12,
            overflow: "hidden",
            minWidth: 195,
            boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
          }}
        >
          {STATUS_ORDER.map((s) => {
            const sm = STATUS_META[s];
            const SI = sm.icon;
            return (
              <button
                key={s}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "10px 16px",
                  width: "100%",
                  background: s === resolved ? sm.bg : "transparent",
                  color: sm.color,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  textAlign: "left",
                  transition: "background 0.1s",
                }}
              >
                <SI size={13} /> {s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Reusable input style
const inp = {
  background: "#F8FAFC",
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  padding: "8px 12px",
  color: "#0F172A",
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ data, setData, nav, allowedModules = ALL_MODULES }) {
  const [upd, setUpd] = useState("");
  const [autor, setAutor] = useState("");

  const allItems = [
    ...data.areas
      .filter((a) => allowedModules.includes(a.id))
      .flatMap((a) => a.clientes.flatMap((c) => c.planos.flatMap((p) => p.items))),
    ...(allowedModules.includes("produtos") ? data.produtos.flatMap((p) => p.items) : []),
  ];
  const total = allItems.length;
  const done = allItems.filter((i) => getItemKanbanStatus(i) === "Finalizado").length;
  const inp2 = allItems.filter((i) => getItemKanbanStatus(i) === "Em Andamento").length;

  const chartData = STATUS_ORDER.map((s) => ({
    name: s === "Pendência Interna" ? "Pend. Int." : s === "Pendência Cliente" ? "Pend. Cli." : s,
    v: allItems.filter((i) => getItemKanbanStatus(i) === s).length,
    color: STATUS_META[s]?.color || "#64748B",
  }));

  function addUpd() {
    if (!upd.trim()) return;
    setData((d) => ({
      ...d,
      updates: [
        {
          id: `u${Date.now()}`,
          date: new Date().toLocaleDateString("pt-BR"),
          area: "Geral",
          texto: upd,
          autor: autor || "Equipe",
        },
        ...d.updates,
      ],
    }));
    setUpd("");
    setAutor("");
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <p style={{ color: "#64748B", fontSize: 12, marginBottom: 4 }}>
          {new Date().toLocaleDateString("pt-BR", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0F172A", letterSpacing: -0.5 }}>
          Painel <span style={{ color: "#0DD3C5" }}>Adeke</span>
        </h1>
      </div>

      {/* KPIs */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}
      >
        {[
          { label: "Iniciativas totais", val: total, color: "#3B82F6", Icon: Activity },
          { label: "Concluídas", val: done, color: "#10B981", Icon: CheckCircle },
          { label: "Em andamento", val: inp2, color: "#F59E0B", Icon: TrendingUp },
        ].map(({ label, val, color, Icon }) => (
          <div
            key={label}
            style={{
              background: "#FFFFFF",
              border: "1px solid #1e2d45",
              borderRadius: 14,
              padding: "20px 22px",
              display: "flex",
              alignItems: "center",
              gap: 16,
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: `${color}18`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon size={18} color={color} />
            </div>
            <div>
              <p style={{ color: "#64748B", fontSize: 11, marginBottom: 2 }}>{label}</p>
              <p style={{ color: "#0F172A", fontSize: 22, fontWeight: 900 }}>{val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Area cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {data.areas
          .filter((area) => allowedModules.includes(area.id))
          .map((area) => {
            const { total: t, done: d, pct } = areaProg(area);
            const AIcon = AREA_ICONS[AREAS.find((x) => x.id === area.id)?.icon] || Shield;
            return (
              <button
                key={area.id}
                onClick={() => nav({ page: "area", areaId: area.id })}
                style={{
                  background: "#FFFFFF",
                  border: `1px solid ${area.color}28`,
                  borderRadius: 14,
                  padding: 22,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 0.15s, background 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = `${area.color}60`;
                  e.currentTarget.style.background = `${area.color}08`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = `${area.color}28`;
                  e.currentTarget.style.background = "#FFFFFF";
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ flex: 1, marginRight: 16 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}
                    >
                      <div
                        style={{
                          background: `${area.color}18`,
                          borderRadius: 8,
                          padding: "6px 8px",
                          display: "flex",
                        }}
                      >
                        <AIcon size={15} color={area.color} />
                      </div>
                      <span style={{ color: area.color, fontSize: 12, fontWeight: 700 }}>
                        {area.name}
                      </span>
                    </div>
                    <p style={{ color: "#0F172A", fontSize: 20, fontWeight: 900, marginBottom: 2 }}>
                      {d}/{t}
                    </p>
                    <p style={{ color: "#64748B", fontSize: 11, marginBottom: 14 }}>
                      {area.clientes.length} cliente{area.clientes.length !== 1 ? "s" : ""} ·
                      iniciativas concluídas
                    </p>
                    <Bar2 pct={pct} color={area.color} />
                  </div>
                  <div
                    style={{
                      position: "relative",
                      width: 80,
                      height: 80,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Ring pct={pct} color={area.color} size={80} />
                    <span
                      style={{
                        position: "absolute",
                        color: "#0F172A",
                        fontSize: 14,
                        fontWeight: 800,
                      }}
                    >
                      {pct}%
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    color: area.color,
                    fontSize: 11,
                    fontWeight: 700,
                    marginTop: 14,
                    justifyContent: "flex-end",
                  }}
                >
                  Ver clientes <ChevronRight size={13} />
                </div>
              </button>
            );
          })}
      </div>

      {/* Produtos strip */}
      {allowedModules.includes("produtos") && (
        <button
          onClick={() => nav({ page: "produtos" })}
          style={{
            width: "100%",
            background: "#FFFFFF",
            border: "1px solid #8B5CF628",
            borderRadius: 14,
            padding: 20,
            cursor: "pointer",
            textAlign: "left",
            marginBottom: 20,
            transition: "border-color 0.15s, background 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#8B5CF660";
            e.currentTarget.style.background = "#8B5CF60a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#8B5CF628";
            e.currentTarget.style.background = "#FFFFFF";
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 16 }}>
            <div
              style={{
                background: "#8B5CF618",
                borderRadius: 8,
                padding: "6px 8px",
                display: "flex",
              }}
            >
              <Rocket size={15} color="#8B5CF6" />
            </div>
            <span style={{ color: "#8B5CF6", fontSize: 12, fontWeight: 700 }}>
              Produtos & Soluções
            </span>
            <span
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: 4,
                color: "#8B5CF6",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              Ver todos <ChevronRight size={13} />
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {data.produtos.map((p) => {
              const { total: t, done: d, pct } = prog(p.items);
              return (
                <div
                  key={p.id}
                  style={{
                    background: `${p.color}0f`,
                    border: `1px solid ${p.color}28`,
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{p.emoji}</div>
                  <div style={{ color: "#0F172A", fontSize: 13, fontWeight: 700, marginBottom: 3 }}>
                    {p.name}
                  </div>
                  <div style={{ color: p.color, fontSize: 10, fontWeight: 600, marginBottom: 8 }}>
                    {d}/{t} etapas
                  </div>
                  <Bar2 pct={pct} color={p.color} />
                </div>
              );
            })}
          </div>
        </button>
      )}

      {/* Chart + Activity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #1e2d45",
            borderRadius: 14,
            padding: 22,
          }}
        >
          <p
            style={{
              color: "#64748B",
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 18,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            Distribuição por status
          </p>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart
              data={chartData}
              barSize={22}
              margin={{ top: 0, right: 0, left: -24, bottom: 0 }}
            >
              <XAxis
                dataKey="name"
                tick={{ fill: "#94A3B8", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: "#F8FAFC",
                  border: "1px solid #2a3550",
                  borderRadius: 8,
                  color: "#0F172A",
                  fontSize: 11,
                }}
                cursor={{ fill: "#ffffff06" }}
              />
              <Bar dataKey="v" radius={[5, 5, 0, 0]}>
                {chartData.map((e, i) => (
                  <Cell key={i} fill={e.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #1e2d45",
            borderRadius: 14,
            padding: 22,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <p
            style={{
              color: "#64748B",
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 14,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            Atualizações recentes
          </p>
          <div style={{ flex: 1, overflowY: "auto", maxHeight: 120, marginBottom: 14 }}>
            {data.updates.slice(0, 6).map((u) => (
              <div
                key={u.id}
                style={{ paddingLeft: 12, borderLeft: "2px solid #0DD3C5", marginBottom: 12 }}
              >
                <p style={{ color: "#1E293B", fontSize: 12, fontWeight: 500, marginBottom: 2 }}>
                  {u.texto}
                </p>
                <p style={{ color: "#64748B", fontSize: 10 }}>
                  {u.autor} · {u.date}
                </p>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={upd}
              onChange={(e) => setUpd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addUpd()}
              placeholder="Registrar atualização..."
              style={{ ...inp, flex: 1 }}
            />
            <button
              onClick={addUpd}
              style={{
                background: "#0DD3C5",
                border: "none",
                borderRadius: 8,
                padding: "8px 12px",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Area View (Client List) ───────────────────────────────────────────────────
function AreaView({ areaId, data, setData, nav }) {
  const area = data.areas.find((a) => a.id === areaId);
  const [newName, setNewName] = useState("");
  const [newClienteResp, setNewClienteResp] = useState([]);
  const me = useCurrentUser();
  const profiles = useProfiles();
  const currentProfile = me ? profiles.find((p) => p.id === me.id) : null;
  const AIcon = AREA_ICONS[AREAS.find((x) => x.id === areaId)?.icon] || Shield;

  const { total, done, pct } = areaProg(area);

  function addCliente() {
    if (!newName.trim()) return;
    const cliente = {
      id: `cli${uid()}`,
      name: newName.trim(),
      responsaveis: newClienteResp,
      descricao: "",
      tags: [],
      dadosEmpresa: {
        contato: "",
        documento: "",
        email: "",
        telefone: "",
        endereco: "",
      },
      planos: buildTemplatePlanos(areaId),
      canalEtica: false,
    };
    setData((d) => ({
      ...d,
      areas: d.areas.map((a) =>
        a.id !== areaId ? a : { ...a, clientes: [...a.clientes, cliente] },
      ),
    }));
    if (newClienteResp.length > 0 && me) {
      emitAtribuicao({
        newIds: newClienteResp,
        oldIds: [],
        ctx: {
          cliente_id: cliente.id,
          cliente_nome: cliente.name,
          modulo: moduloOf(areaId),
          plano_id: "",
          plano_nome: "",
          item_id: null,
          item_nome: null,
          autor_id: me.id,
          autor_nome: currentProfile?.display_name || me?.email || "sistema",
          trecho: "foi adicionado como responsável",
        },
      });
    }
    setNewName("");
    setNewClienteResp([]);
  }
  function removeCliente(cId) {
    if (!confirm("Remover este cliente e todos os seus planos?")) return;
    setData((d) => ({
      ...d,
      areas: d.areas.map((a) =>
        a.id !== areaId ? a : { ...a, clientes: a.clientes.filter((c) => c.id !== cId) },
      ),
    }));
  }
  function toggleCanalEtica(cId) {
    setData((d) => ({
      ...d,
      areas: d.areas.map((a) =>
        a.id !== areaId
          ? a
          : {
              ...a,
              clientes: a.clientes.map((c) =>
                c.id !== cId ? c : { ...c, canalEtica: !c.canalEtica },
              ),
            },
      ),
    }));
  }
  function setResp(val) {
    setData((d) => ({
      ...d,
      areas: d.areas.map((a) => (a.id !== areaId ? a : { ...a, responsavel: val })),
    }));
  }
  function setDpo(val) {
    setData((d) => ({
      ...d,
      areas: d.areas.map((a) => (a.id !== areaId ? a : { ...a, dpo: val })),
    }));
  }

  return (
    <div>
      <button
        onClick={() => nav({ page: "dashboard" })}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "#64748B",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 13,
          marginBottom: 22,
          fontFamily: "inherit",
        }}
      >
        <ArrowLeft size={15} /> Voltar ao Painel
      </button>

      {/* Header */}
      <div
        style={{
          background: "#FFFFFF",
          border: `1px solid ${area.color}30`,
          borderRadius: 16,
          padding: 26,
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ background: `${area.color}18`, borderRadius: 10, padding: 10 }}>
                <AIcon size={20} color={area.color} />
              </div>
              <h2 style={{ color: "#0F172A", fontSize: 20, fontWeight: 900 }}>{area.name}</h2>
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <User size={13} color="#475569" />
                <span style={{ color: "#64748B", fontSize: 12 }}>Responsáveis:</span>
                <ResponsaveisPicker
                  value={area.responsaveis || []}
                  onChange={(ids) =>
                    setData((d) => ({
                      ...d,
                      areas: d.areas.map((a) =>
                        a.id !== areaId ? a : { ...a, responsaveis: ids },
                      ),
                    }))
                  }
                />
              </label>
              {areaId === "lgpd" && (
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Shield size={13} color="#475569" />
                  <span style={{ color: "#64748B", fontSize: 12 }}>DPO:</span>
                  <input
                    value={area.dpo || ""}
                    onChange={(e) => setDpo(e.target.value)}
                    placeholder="Nome do DPO..."
                    style={{ ...inp, width: 180 }}
                  />
                </label>
              )}
            </div>
          </div>
          <div
            style={{
              position: "relative",
              width: 100,
              height: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Ring pct={pct} color={area.color} size={100} stroke={9} />
            <div style={{ position: "absolute", textAlign: "center" }}>
              <p style={{ color: "#0F172A", fontSize: 18, fontWeight: 900 }}>{pct}%</p>
              <p style={{ color: "#64748B", fontSize: 10 }}>
                {done}/{total}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Add client */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 20,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCliente()}
          placeholder="Nome do cliente..."
          style={{ ...inp, flex: 1, minWidth: 200, fontSize: 13, padding: "9px 14px" }}
        />
        <ResponsaveisPicker
          value={newClienteResp}
          onChange={setNewClienteResp}
          label="Responsáveis"
        />
        <button
          onClick={addCliente}
          style={{
            background: area.color,
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "inherit",
          }}
        >
          <Plus size={15} /> Adicionar Cliente
        </button>
      </div>

      {/* Client grid */}
      {area.clientes.length === 0 ? (
        <div
          style={{
            background: "#FFFFFF",
            border: "1px dashed #1e2d45",
            borderRadius: 16,
            padding: 48,
            textAlign: "center",
          }}
        >
          <Building2 size={28} color="#E2E8F0" style={{ margin: "0 auto 12px" }} />
          <p style={{ color: "#94A3B8", fontSize: 14, fontWeight: 600 }}>
            Nenhum cliente cadastrado
          </p>
          <p style={{ color: "#E2E8F0", fontSize: 12, marginTop: 4 }}>
            Adicione o primeiro cliente acima para começar
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {area.clientes.map((cliente) => {
            const cItems = cliente.planos.flatMap((p) => p.items);
            const { total: ct, done: cd, pct: cp } = prog(cItems);
            return (
              <div
                key={cliente.id}
                style={{
                  background: "#FFFFFF",
                  border: `1px solid ${area.color}28`,
                  borderRadius: 16,
                  padding: 22,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 14,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <div
                        style={{
                          background: `${area.color}18`,
                          borderRadius: 8,
                          padding: "5px 6px",
                          display: "flex",
                        }}
                      >
                        <Building2 size={14} color={area.color} />
                      </div>
                      <span style={{ color: "#0F172A", fontSize: 15, fontWeight: 800 }}>
                        {cliente.name}
                      </span>
                    </div>
                    <p style={{ color: "#64748B", fontSize: 11, marginBottom: 12 }}>
                      {cliente.planos.length} plano{cliente.planos.length !== 1 ? "s" : ""} · {ct}{" "}
                      item{ct !== 1 ? "s" : ""}
                    </p>
                    {(cliente.tags || []).length > 0 && (
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                        {(cliente.tags || []).slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            style={{
                              background: `${area.color}12`,
                              color: area.color,
                              borderRadius: 6,
                              padding: "3px 6px",
                              fontSize: 10,
                              fontWeight: 800,
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <Bar2 pct={cp} color={area.color} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 14 }}>
                    <div
                      style={{
                        position: "relative",
                        width: 54,
                        height: 54,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ring pct={cp} color={area.color} size={54} stroke={5} />
                      <span
                        style={{
                          position: "absolute",
                          color: "#0F172A",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        {cp}%
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => nav({ page: "cliente", areaId, clienteId: cliente.id })}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      background: `${area.color}18`,
                      border: `1px solid ${area.color}30`,
                      borderRadius: 8,
                      color: area.color,
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "7px 0",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <FolderOpen size={13} /> Ver Planos <ChevronRight size={12} />
                  </button>
                  <button
                    onClick={() => toggleCanalEtica(cliente.id)}
                    title="Ativar/desativar Canal de Ética para este cliente"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "7px 12px",
                      borderRadius: 8,
                      background: cliente.canalEtica ? "#FDF2F8" : "#F8FAFC",
                      border: `1px solid ${cliente.canalEtica ? "#EC489950" : "#E2E8F0"}`,
                      color: cliente.canalEtica ? "#EC4899" : "#94A3B8",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                    }}
                  >
                    🛡️ {cliente.canalEtica ? "Canal ✓" : "Canal"}
                  </button>
                  <button
                    onClick={() => removeCliente(cliente.id)}
                    style={{
                      background: "#ef444415",
                      border: "1px solid #ef444430",
                      borderRadius: 8,
                      color: "#ef4444",
                      padding: "7px 10px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Cliente View (Plan List) ──────────────────────────────────────────────────
function ClienteView({ areaId, clienteId, data, setData, nav }) {
  const area = data.areas.find((a) => a.id === areaId);
  const cliente = area.clientes.find((c) => c.id === clienteId);
  const [newPlanoName, setNewPlanoName] = useState("");
  const [newPlanoResp, setNewPlanoResp] = useState([]);
  const [openNotasId, setOpenNotasId] = useState(null);
  const [notaDraft, setNotaDraft] = useState({});
  const [newTag, setNewTag] = useState("");
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const me = useCurrentUser();
  const profiles = useProfiles();
  const currentProfile = me ? profiles.find((p) => p.id === me.id) : null;

  function reorderPlanos(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    updatePlanos((planos) => reorderById(planos, sourceId, targetId));
  }

  if (!cliente) return null;

  function updateCliente(patch) {
    setData((d) => ({
      ...d,
      areas: d.areas.map((a) =>
        a.id !== areaId
          ? a
          : {
              ...a,
              clientes: a.clientes.map((c) => (c.id !== clienteId ? c : { ...c, ...patch })),
            },
      ),
    }));
  }

  function updateClienteDados(field, value) {
    updateCliente({
      dadosEmpresa: {
        ...(cliente.dadosEmpresa || {}),
        [field]: value,
      },
    });
  }

  function addClienteTag() {
    const tag = newTag.trim();
    if (!tag) return;
    const current = cliente.tags || [];
    if (current.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setNewTag("");
      return;
    }
    updateCliente({ tags: [...current, tag] });
    setNewTag("");
  }

  function removeClienteTag(tag) {
    updateCliente({ tags: (cliente.tags || []).filter((t) => t !== tag) });
  }

  function updatePlanos(updater) {
    setData((d) => ({
      ...d,
      areas: d.areas.map((a) =>
        a.id !== areaId
          ? a
          : {
              ...a,
              clientes: a.clientes.map((c) =>
                c.id !== clienteId ? c : { ...c, planos: updater(c.planos) },
              ),
            },
      ),
    }));
  }

  function addPlano() {
    if (!newPlanoName.trim()) return;
    const plano = {
      id: `pl${uid()}`,
      name: newPlanoName.trim(),
      responsavel: "",
      responsaveis: newPlanoResp,
      notas: [],
      items: [],
    };
    updatePlanos((planos) => sortPlanosByCompletion([...planos, plano]));
    if (newPlanoResp.length > 0 && me) {
      emitAtribuicao({
        newIds: newPlanoResp,
        oldIds: [],
        ctx: {
          cliente_id: cliente.id,
          cliente_nome: cliente.name,
          modulo: moduloOf(areaId),
          plano_id: plano.id,
          plano_nome: plano.name,
          item_id: null,
          item_nome: null,
          autor_id: me.id,
          autor_nome: currentProfile?.display_name || me?.email || "sistema",
          trecho: "foi adicionado como responsável",
        },
      });
    }
    setNewPlanoName("");
    setNewPlanoResp([]);
  }
  function removePlano(planoId) {
    if (!confirm("Remover este plano e todos os seus itens?")) return;
    updatePlanos((planos) => planos.filter((p) => p.id !== planoId));
  }
  function setPlanoResponsaveis(planoId, ids) {
    updatePlanos((planos) =>
      planos.map((p) => (p.id !== planoId ? p : { ...p, responsaveis: ids })),
    );
  }
  function movePlano(planoId, dir) {
    updatePlanos((planos) => {
      const idx = planos.findIndex((p) => p.id === planoId);
      if (idx < 0) return planos;
      return moveInArray(planos, idx, dir);
    });
  }
  function addNota(plano) {
    const txt = (notaDraft[plano.id] || "").trim();
    if (!txt) return;
    const meName = profiles.find((p) => p.id === me?.id)?.display_name || "Usuário";
    const entry = {
      id: `n${uid()}`,
      date: todayBR(),
      text: txt,
      autor_id: me?.id || null,
      autor_nome: meName,
    };
    updatePlanos((planos) =>
      planos.map((p) => (p.id !== plano.id ? p : { ...p, notas: [...(p.notas || []), entry] })),
    );
    setNotaDraft((d) => ({ ...d, [plano.id]: "" }));
    // Emit notifications
    if (me) {
      const mentioned = extractMentions(txt, profiles).map((p) => p.id);
      const resp = [...(plano.responsaveis || []), ...(cliente.responsaveis || [])];
      emitNotifications({
        ctx: {
          cliente_id: cliente.id,
          cliente_nome: cliente.name,
          modulo: moduloOf(areaId),
          plano_id: plano.id,
          plano_nome: plano.name,
          autor_id: me.id,
          autor_nome: meName,
          trecho: txt,
        },
        mentionedIds: mentioned,
        responsibleIds: resp,
      });
    }
  }
  function removeNota(planoId, notaId) {
    updatePlanos((planos) =>
      planos.map((p) =>
        p.id !== planoId ? p : { ...p, notas: (p.notas || []).filter((n) => n.id !== notaId) },
      ),
    );
  }

  const totalGeral = cliente.planos.flatMap((p) => p.items);
  const { pct: pctGeral } = prog(totalGeral);

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 22 }}>
        <button
          onClick={() => nav({ page: "dashboard" })}
          style={{
            color: "#94A3B8",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          Painel
        </button>
        <ChevronRight size={13} color="#334155" />
        <button
          onClick={() => nav({ page: "area", areaId })}
          style={{
            color: "#94A3B8",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          {area.name}
        </button>
        <ChevronRight size={13} color="#334155" />
        <span style={{ color: "#64748B", fontSize: 12, fontWeight: 600 }}>{cliente.name}</span>
      </div>

      {/* Header */}
      <div
        style={{
          background: "#FFFFFF",
          border: `1px solid ${area.color}30`,
          borderRadius: 16,
          padding: 26,
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ background: `${area.color}18`, borderRadius: 10, padding: 10 }}>
                <Building2 size={20} color={area.color} />
              </div>
              <div>
                <h2 style={{ color: "#0F172A", fontSize: 20, fontWeight: 900 }}>{cliente.name}</h2>
                <p style={{ color: "#64748B", fontSize: 12 }}>{area.name}</p>
              </div>
            </div>
            <p style={{ color: "#64748B", fontSize: 13, marginTop: 10 }}>
              {cliente.planos.length} plano{cliente.planos.length !== 1 ? "s" : ""} cadastrado
              {cliente.planos.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div
            style={{
              position: "relative",
              width: 100,
              height: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ring pct={pctGeral} color={area.color} size={100} stroke={9} />
            <div style={{ position: "absolute", textAlign: "center" }}>
              <p style={{ color: "#0F172A", fontSize: 18, fontWeight: 900 }}>{pctGeral}%</p>
              <p style={{ color: "#64748B", fontSize: 10 }}>geral</p>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E2E8F0",
          borderRadius: 12,
          padding: 18,
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Info size={15} color={area.color} />
          <h3 style={{ color: "#0F172A", fontSize: 14, fontWeight: 900 }}>Dados do cliente</h3>
        </div>
        <textarea
          value={cliente.descricao || ""}
          onChange={(e) => updateCliente({ descricao: e.target.value })}
          placeholder="DescriÃ§Ã£o aberta do cliente, contexto, combinados e observaÃ§Ãµes gerais..."
          rows={3}
          style={{ ...inp, width: "100%", resize: "vertical", marginBottom: 12, lineHeight: 1.5 }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(140px, 1fr))",
            gap: 8,
            marginBottom: 12,
          }}
        >
          {[
            ["contato", "Contato principal"],
            ["documento", "CPF / CNPJ"],
            ["email", "E-mail"],
            ["telefone", "Telefone"],
            ["endereco", "EndereÃ§o"],
          ].map(([field, placeholder]) => (
            <input
              key={field}
              value={cliente.dadosEmpresa?.[field] || ""}
              onChange={(e) => updateClienteDados(field, e.target.value)}
              placeholder={placeholder}
              style={{ ...inp, fontSize: 12, padding: "8px 10px" }}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {(cliente.tags || []).map((tag) => (
            <button
              key={tag}
              onClick={() => removeClienteTag(tag)}
              title="Remover tag"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                border: `1px solid ${area.color}30`,
                background: `${area.color}12`,
                color: area.color,
                borderRadius: 8,
                padding: "5px 8px",
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {tag} <X size={11} />
            </button>
          ))}
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addClienteTag()}
            placeholder="Adicionar tag..."
            style={{ ...inp, width: 170, fontSize: 12, padding: "7px 10px" }}
          />
          <button
            onClick={addClienteTag}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "#F8FAFC",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              color: "#64748B",
              padding: "7px 10px",
              fontSize: 11,
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <Plus size={12} /> Tag
          </button>
        </div>
      </div>

      {/* Add plan */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 20,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          value={newPlanoName}
          onChange={(e) => setNewPlanoName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addPlano()}
          placeholder="Nome do plano (ex: Plano de Integridade)..."
          style={{ ...inp, flex: 1, minWidth: 200, fontSize: 13, padding: "9px 14px" }}
        />
        <ResponsaveisPicker value={newPlanoResp} onChange={setNewPlanoResp} label="Responsáveis" />
        <button
          onClick={addPlano}
          style={{
            background: area.color,
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "inherit",
          }}
        >
          <Plus size={15} /> Novo Plano
        </button>
      </div>

      {/* Plans */}
      {cliente.planos.length === 0 ? (
        <div
          style={{
            background: "#FFFFFF",
            border: "1px dashed #1e2d45",
            borderRadius: 16,
            padding: 48,
            textAlign: "center",
          }}
        >
          <FolderOpen size={28} color="#E2E8F0" style={{ margin: "0 auto 12px" }} />
          <p style={{ color: "#94A3B8", fontSize: 14, fontWeight: 600 }}>Nenhum plano criado</p>
          <p style={{ color: "#E2E8F0", fontSize: 12, marginTop: 4 }}>
            Crie o primeiro plano para este cliente
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {cliente.planos.map((plano, pIdx) => {
            const { total: pt, done: pd, pct: pp } = prog(plano.items);
            const isDone = planoIsDone(plano);
            const notasCount = (plano.notas || []).length;
            const isNotasOpen = openNotasId === plano.id;
            const isDragging = dragId === plano.id;
            const isDragOver = dragOverId === plano.id && dragId !== plano.id;
            return (
              <div
                key={plano.id}
                draggable
                onDragStart={(e) => {
                  setDragId(plano.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverId !== plano.id) setDragOverId(plano.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === plano.id) setDragOverId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  reorderPlanos(dragId, plano.id);
                  setDragId(null);
                  setDragOverId(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
                style={{
                  background: "#FFFFFF",
                  border: `${isDragOver ? 2 : 1}px ${isDragOver ? "dashed" : "solid"} ${isDragOver ? area.color : isDone ? "#10B98140" : area.color + "20"}`,
                  borderRadius: 16,
                  padding: 22,
                  opacity: isDragging ? 0.5 : isDone ? 0.85 : 1,
                  cursor: "grab",
                  transition: "border-color 0.15s, opacity 0.15s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ flex: 1, marginRight: 16 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}
                    >
                      <span
                        title="Arraste para reordenar"
                        style={{
                          color: "#94A3B8",
                          fontSize: 14,
                          cursor: "grab",
                          userSelect: "none",
                        }}
                      >
                        ⋮⋮
                      </span>
                      <FolderOpen size={16} color={area.color} />
                      <span style={{ color: "#0F172A", fontSize: 16, fontWeight: 800 }}>
                        {plano.name}
                      </span>
                      {isDone && (
                        <span
                          style={{
                            background: "#ECFDF5",
                            color: "#10B981",
                            border: "1px solid #10B98140",
                            borderRadius: 20,
                            padding: "2px 10px",
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          ✓ Concluído
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ color: "#64748B", fontSize: 12 }}>Responsáveis:</span>
                      <ResponsaveisPicker
                        value={plano.responsaveis || []}
                        onChange={(ids) => {
                          const old = plano.responsaveis || [];
                          setPlanoResponsaveis(plano.id, ids);
                          if (me) {
                            emitAtribuicao({
                              newIds: ids,
                              oldIds: old,
                              ctx: {
                                cliente_id: cliente.id,
                                cliente_nome: cliente.name,
                                modulo: moduloOf(areaId),
                                plano_id: plano.id,
                                plano_nome: plano.name,
                                item_id: null,
                                item_nome: null,
                                autor_id: me.id,
                                autor_nome: currentProfile?.display_name || me.email || "sistema",
                                trecho:
                                  ids.length > old.length
                                    ? "foi adicionado como responsável"
                                    : "foi removido como responsável",
                              },
                            });
                          }
                        }}
                      />
                      <button
                        onClick={() => setOpenNotasId(isNotasOpen ? null : plano.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          background: isNotasOpen ? "#FEF3C7" : "#F8FAFC",
                          border: `1px solid ${isNotasOpen ? "#F59E0B50" : "#E2E8F0"}`,
                          borderRadius: 8,
                          color: isNotasOpen ? "#B45309" : "#64748B",
                          padding: "6px 10px",
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 700,
                          fontFamily: "inherit",
                        }}
                      >
                        <MessageSquare size={12} /> Notas {notasCount > 0 && `(${notasCount})`}
                      </button>
                    </div>
                    <p style={{ color: "#64748B", fontSize: 12, marginBottom: 10 }}>
                      {pd}/{pt} itens concluídos
                    </p>
                    <Bar2 pct={pp} color={area.color} />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        width: 64,
                        height: 64,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ring pct={pp} color={area.color} size={64} stroke={6} />
                      <span
                        style={{
                          position: "absolute",
                          color: "#0F172A",
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {pp}%
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={() => movePlano(plano.id, -1)}
                        disabled={pIdx === 0}
                        title="Mover para cima"
                        style={{
                          background: "#F1F5F9",
                          border: "1px solid #E2E8F0",
                          borderRadius: 6,
                          color: "#475569",
                          padding: "4px 6px",
                          cursor: pIdx === 0 ? "not-allowed" : "pointer",
                          display: "flex",
                          opacity: pIdx === 0 ? 0.4 : 1,
                        }}
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        onClick={() => movePlano(plano.id, 1)}
                        disabled={pIdx === cliente.planos.length - 1}
                        title="Mover para baixo"
                        style={{
                          background: "#F1F5F9",
                          border: "1px solid #E2E8F0",
                          borderRadius: 6,
                          color: "#475569",
                          padding: "4px 6px",
                          cursor: pIdx === cliente.planos.length - 1 ? "not-allowed" : "pointer",
                          display: "flex",
                          opacity: pIdx === cliente.planos.length - 1 ? 0.4 : 1,
                        }}
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                    <button
                      onClick={() => removePlano(plano.id)}
                      style={{
                        background: "#ef444415",
                        border: "1px solid #ef444430",
                        borderRadius: 7,
                        color: "#ef4444",
                        padding: "5px 8px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Notas block */}
                {isNotasOpen && (
                  <div
                    style={{
                      marginTop: 14,
                      background: "#FFFBEB",
                      border: "1px solid #FDE68A",
                      borderRadius: 10,
                      padding: 14,
                    }}
                  >
                    <p
                      style={{
                        color: "#92400E",
                        fontSize: 11,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 10,
                      }}
                    >
                      Histórico de Notas — {plano.name}
                    </p>
                    {(plano.notas || []).length === 0 ? (
                      <p
                        style={{
                          color: "#A16207",
                          fontSize: 12,
                          fontStyle: "italic",
                          marginBottom: 10,
                        }}
                      >
                        Nenhuma nota registrada ainda.
                      </p>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          marginBottom: 12,
                          maxHeight: 220,
                          overflowY: "auto",
                        }}
                      >
                        {(plano.notas || []).map((n) => (
                          <div
                            key={n.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: 8,
                              background: "#FFFFFF",
                              border: "1px solid #FDE68A",
                              borderRadius: 8,
                              padding: "8px 12px",
                            }}
                          >
                            <p style={{ color: "#0F172A", fontSize: 12, lineHeight: 1.5, flex: 1 }}>
                              <span style={{ color: "#B45309", fontWeight: 700 }}>{n.date}</span>
                              {n.autor_nome && (
                                <span style={{ color: "#92400E", fontWeight: 600 }}>
                                  {" "}
                                  · {n.autor_nome}
                                </span>
                              )}
                              {" — "}
                              <MentionText text={n.text} />
                            </p>
                            <button
                              onClick={() => removeNota(plano.id, n.id)}
                              title="Remover nota"
                              style={{
                                background: "none",
                                border: "none",
                                color: "#CBD5E1",
                                cursor: "pointer",
                                padding: 2,
                              }}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                      <MentionTextarea
                        value={notaDraft[plano.id] || ""}
                        onChange={(v) => setNotaDraft((d) => ({ ...d, [plano.id]: v }))}
                        onSubmit={() => addNota(plano)}
                        placeholder="Nova nota... use @ para mencionar"
                      />
                      <button
                        onClick={() => addNota(plano)}
                        style={{
                          background: "#B45309",
                          border: "none",
                          borderRadius: 8,
                          padding: "8px 14px",
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: "inherit",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          flexShrink: 0,
                        }}
                      >
                        <Plus size={13} /> Adicionar
                      </button>
                    </div>
                  </div>
                )}

                {/* Item preview */}
                {plano.items.length > 0 && (
                  <div
                    style={{
                      marginTop: 14,
                      background: "#F8FAFC",
                      borderRadius: 10,
                      padding: "8px 14px",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                    }}
                  >
                    {plano.items.slice(0, 4).map((it) => (
                      <span
                        key={it.id}
                        style={{
                          padding: "3px 8px",
                          borderRadius: 20,
                          fontSize: 10,
                          fontWeight: 600,
                          background: `${area.color}15`,
                          color: area.color,
                          border: `1px solid ${area.color}25`,
                        }}
                      >
                        {it.name.length > 28 ? it.name.slice(0, 28) + "…" : it.name}
                      </span>
                    ))}
                    {plano.items.length > 4 && (
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 20,
                          fontSize: 10,
                          fontWeight: 600,
                          background: "#E2E8F0",
                          color: "#64748B",
                        }}
                      >
                        +{plano.items.length - 4} mais
                      </span>
                    )}
                  </div>
                )}

                <button
                  onClick={() => nav({ page: "plano", areaId, clienteId, planoId: plano.id })}
                  style={{
                    width: "100%",
                    marginTop: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    background: `${area.color}18`,
                    border: `1px solid ${area.color}30`,
                    borderRadius: 10,
                    color: area.color,
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "9px 0",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Gerenciar Itens <ChevronRight size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Plano View (Items) ────────────────────────────────────────────────────────
function RiskAssessmentPanel({ area, cliente, plano, onAssessmentChange, onCreateItems }) {
  const assessment = plano.riskAssessment || {};
  const [transcriptDraft, setTranscriptDraft] = useState(assessment.transcript || "");
  const rows = assessment.rows || [];
  const answers = assessment.answers || {};
  const summary = summarizeRiskRows(rows);
  const granolaWebhookUrl =
    typeof window === "undefined"
      ? "/api/granola-risk"
      : `${window.location.origin}/api/granola-risk`;

  useEffect(() => {
    setTranscriptDraft(assessment.transcript || "");
  }, [plano.id, assessment.transcript]);

  function patchAssessment(patch) {
    onAssessmentChange({
      ...assessment,
      updatedAt: new Date().toISOString(),
      ...patch,
    });
  }

  function updateRow(rowId, patch) {
    patchAssessment({
      rows: rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    });
  }

  function removeRow(rowId) {
    patchAssessment({ rows: rows.filter((row) => row.id !== rowId) });
  }

  function generateFromTranscript() {
    const generated = generateRiskRowsFromTranscript(transcriptDraft);
    const existingBySource = new Set(rows.map((row) => row.sourceId));
    const merged = [
      ...rows,
      ...generated.filter((row) => !row.sourceId || !existingBySource.has(row.sourceId)),
    ];
    patchAssessment({
      transcript: transcriptDraft,
      rows: merged,
      lastGeneratedAt: new Date().toISOString(),
    });
  }

  function applyAnswer(question, atende) {
    const nextAnswers = {
      ...answers,
      [question.id]: {
        ...(answers[question.id] || {}),
        atende,
        pergunta: question.pergunta,
        updatedAt: new Date().toISOString(),
      },
    };
    let nextRows = rows;
    const exists = rows.some((row) => row.sourceId === question.id);
    if (atende === "S") {
      nextRows = rows.filter((row) => row.sourceId !== question.id);
    } else if ((atende === "N" || atende === "P") && !exists) {
      nextRows = [...rows, riskRowFromQuestion(question, atende, "Questionario")];
    } else if (atende === "N" || atende === "P") {
      nextRows = rows.map((row) => (row.sourceId === question.id ? { ...row, atende } : row));
    }
    patchAssessment({ answers: nextAnswers, rows: nextRows });
  }

  function updateEvidence(question, evidencia) {
    patchAssessment({
      answers: {
        ...answers,
        [question.id]: {
          ...(answers[question.id] || {}),
          pergunta: question.pergunta,
          evidencia,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }

  const statStyle = {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 10,
    padding: 14,
  };

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: `1px solid ${area.color}30`,
        borderRadius: 16,
        padding: 20,
        marginBottom: 22,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p style={{ color: area.color, fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
            Risk Assessment funcional
          </p>
          <h3 style={{ color: "#0F172A", fontSize: 18, fontWeight: 900, marginBottom: 4 }}>
            Diagnostico de risco de {cliente.name}
          </h3>
          <p style={{ color: "#64748B", fontSize: 12, lineHeight: 1.5 }}>
            Questionario e matriz inspirados nos modelos CoHidro e Consolidado. A transcricao gera
            gaps, sugestoes e planos de acao que podem virar itens suspensos deste plano.
          </p>
        </div>
        <button
          onClick={() => onCreateItems(rows)}
          disabled={!rows.length}
          style={{
            alignSelf: "flex-start",
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: rows.length ? area.color : "#E2E8F0",
            border: "none",
            borderRadius: 9,
            color: rows.length ? "#fff" : "#94A3B8",
            cursor: rows.length ? "pointer" : "not-allowed",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 800,
            padding: "9px 14px",
          }}
        >
          <Plus size={14} /> Criar itens suspensos
        </button>
      </div>

      <div
        style={{
          marginTop: 16,
          background: "#F8FAFC",
          border: "1px solid #D1FAE5",
          borderRadius: 12,
          padding: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Activity size={15} color="#10B981" />
          <p style={{ color: "#0F172A", fontSize: 13, fontWeight: 900 }}>
            Granola conectado por webhook
          </p>
        </div>
        <p style={{ color: "#64748B", fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
          No Zapier, use Granola como gatilho de nova nota/transcricao e envie um POST para esta URL
          com `clientName` ou `clienteId`, `title`, `summary`, `transcript` e `noteUrl`. Inclua
          tambem o header `x-granola-secret` configurado para a Adeke.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
          <input value={granolaWebhookUrl} readOnly style={{ ...inp, width: "100%" }} />
          <button
            onClick={() => navigator.clipboard?.writeText(granolaWebhookUrl)}
            style={{
              background: "#ECFDF5",
              border: "1px solid #A7F3D0",
              borderRadius: 8,
              color: "#047857",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 800,
              padding: "8px 12px",
            }}
          >
            Copiar URL
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(130px, 1fr))",
          gap: 10,
          marginTop: 16,
        }}
      >
        <div style={statStyle}>
          <p
            style={{ color: "#94A3B8", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}
          >
            Gaps
          </p>
          <p style={{ color: "#0F172A", fontSize: 24, fontWeight: 900 }}>{summary.total}</p>
        </div>
        <div style={statStyle}>
          <p
            style={{ color: "#94A3B8", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}
          >
            Alta prioridade
          </p>
          <p style={{ color: "#EF4444", fontSize: 24, fontWeight: 900 }}>{summary.high}</p>
        </div>
        <div style={statStyle}>
          <p
            style={{ color: "#94A3B8", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}
          >
            Media prioridade
          </p>
          <p style={{ color: "#F59E0B", fontSize: 24, fontWeight: 900 }}>{summary.medium}</p>
        </div>
        <div style={statStyle}>
          <p
            style={{ color: "#94A3B8", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}
          >
            Atendimento
          </p>
          <p style={{ color: "#10B981", fontSize: 24, fontWeight: 900 }}>{summary.pct}%</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
        <div>
          <p style={{ color: "#0F172A", fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
            Transcricao da reuniao inicial
          </p>
          <MentionTextarea
            value={transcriptDraft}
            onChange={setTranscriptDraft}
            placeholder="Cole aqui a transcricao ou resumo da reuniao..."
            rows={8}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button
              onClick={generateFromTranscript}
              style={{
                background: area.color,
                border: "none",
                borderRadius: 8,
                color: "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 800,
                padding: "8px 12px",
              }}
            >
              Gerar diagnostico
            </button>
            <button
              onClick={() => patchAssessment({ transcript: transcriptDraft })}
              style={{
                background: "#F1F5F9",
                border: "1px solid #E2E8F0",
                borderRadius: 8,
                color: "#475569",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 800,
                padding: "8px 12px",
              }}
            >
              Salvar transcricao
            </button>
          </div>
        </div>

        <div>
          <p style={{ color: "#0F172A", fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
            Questionario base
          </p>
          <div
            style={{
              border: "1px solid #E2E8F0",
              borderRadius: 12,
              overflow: "hidden",
              maxHeight: 285,
              overflowY: "auto",
            }}
          >
            {RISK_QUESTIONS.map((question) => {
              const answer = answers[question.id] || {};
              return (
                <div key={question.id} style={{ padding: 12, borderBottom: "1px solid #F1F5F9" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: "#0F172A", fontSize: 12, fontWeight: 800 }}>
                        {question.assunto}
                      </p>
                      <p style={{ color: "#64748B", fontSize: 11, lineHeight: 1.45 }}>
                        {question.pergunta}
                      </p>
                    </div>
                    <select
                      value={answer.atende || ""}
                      onChange={(e) => applyAnswer(question, e.target.value)}
                      style={{ ...inp, width: 82, height: 34, padding: "6px 8px" }}
                    >
                      <option value="">-</option>
                      <option value="S">S</option>
                      <option value="N">N</option>
                      <option value="P">P</option>
                    </select>
                  </div>
                  <input
                    value={answer.evidencia || ""}
                    onChange={(e) => updateEvidence(question, e.target.value)}
                    placeholder="Evidencia ou observacao..."
                    style={{ ...inp, marginTop: 8, width: "100%" }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <p style={{ color: "#0F172A", fontSize: 13, fontWeight: 800 }}>
            Matriz de gaps e plano de acao
          </p>
          <p style={{ color: "#94A3B8", fontSize: 11 }}>
            {Object.entries(summary.byType)
              .map(([name, count]) => `${name}: ${count}`)
              .join("  |  ") || "Nenhum gap classificado"}
          </p>
        </div>
        <div style={{ border: "1px solid #E2E8F0", borderRadius: 12, overflowX: "auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 90px 130px 130px 1.2fr 1.2fr 90px 36px",
              minWidth: 1080,
              background: "#F8FAFC",
              borderBottom: "1px solid #E2E8F0",
            }}
          >
            {["Assunto", "Atende", "Area", "Risco", "Sugestao", "Plano de acao", "Prior.", ""].map(
              (h) => (
                <span
                  key={h}
                  style={{
                    color: "#94A3B8",
                    fontSize: 10,
                    fontWeight: 800,
                    padding: 10,
                    textTransform: "uppercase",
                  }}
                >
                  {h}
                </span>
              ),
            )}
          </div>
          {rows.length === 0 ? (
            <div style={{ padding: 18, color: "#94A3B8", fontSize: 12 }}>
              Cole uma transcricao ou responda o questionario para gerar a matriz.
            </div>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 90px 130px 130px 1.2fr 1.2fr 90px 36px",
                  minWidth: 1080,
                  borderBottom: "1px solid #F1F5F9",
                  alignItems: "center",
                }}
              >
                <input
                  value={row.assunto || ""}
                  onChange={(e) => updateRow(row.id, { assunto: e.target.value })}
                  style={{ ...inp, border: "none", borderRadius: 0 }}
                />
                <select
                  value={row.atende || "P"}
                  onChange={(e) => updateRow(row.id, { atende: e.target.value })}
                  style={{ ...inp, border: "none", borderRadius: 0 }}
                >
                  <option value="S">S</option>
                  <option value="N">N</option>
                  <option value="P">P</option>
                </select>
                <input
                  value={row.area || ""}
                  onChange={(e) => updateRow(row.id, { area: e.target.value })}
                  style={{ ...inp, border: "none", borderRadius: 0 }}
                />
                <input
                  value={row.tipoRisco || ""}
                  onChange={(e) => updateRow(row.id, { tipoRisco: e.target.value })}
                  style={{ ...inp, border: "none", borderRadius: 0 }}
                />
                <input
                  value={row.sugestao || ""}
                  onChange={(e) => updateRow(row.id, { sugestao: e.target.value })}
                  style={{ ...inp, border: "none", borderRadius: 0 }}
                />
                <input
                  value={row.planoAcao || ""}
                  onChange={(e) => updateRow(row.id, { planoAcao: e.target.value })}
                  style={{ ...inp, border: "none", borderRadius: 0 }}
                />
                <select
                  value={row.importancia || "Media"}
                  onChange={(e) => updateRow(row.id, { importancia: e.target.value })}
                  style={{ ...inp, border: "none", borderRadius: 0 }}
                >
                  <option value="Alta">Alta</option>
                  <option value="Media">Media</option>
                  <option value="Baixa">Baixa</option>
                </select>
                <button
                  onClick={() => removeRow(row.id)}
                  title="Remover gap"
                  style={{
                    background: "none",
                    border: "none",
                    color: "#CBD5E1",
                    cursor: "pointer",
                    padding: 8,
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PlanoView({ areaId, clienteId, planoId, data, setData, nav }) {
  const area = data.areas.find((a) => a.id === areaId);
  const cliente = area?.clientes.find((c) => c.id === clienteId);
  const plano = cliente?.planos.find((p) => p.id === planoId);
  const currentUser = useCurrentUser();
  const allProfiles = useProfiles();
  const currentProfile = currentUser ? allProfiles.find((p) => p.id === currentUser.id) : null;
  const [newName, setNewName] = useState("");
  const [newTipo, setNewTipo] = useState(TIPOS_ITEM[0]);
  const [newResp, setNewResp] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [dragItemId, setDragItemId] = useState(null);
  const [dragOverItemId, setDragOverItemId] = useState(null);
  const [modalItemId, setModalItemId] = useState(null);

  function reorderItems(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setPlanos((planos) =>
      planos.map((p) =>
        p.id !== planoId ? p : { ...p, items: reorderById(p.items, sourceId, targetId) },
      ),
    );
  }

  if (!plano) return null;
  const { total, done, pct } = prog(plano.items);

  function updateItemsAndResort(planos, planoId, mutator) {
    return sortPlanosByCompletion(
      planos.map((p) => {
        if (p.id !== planoId) return p;
        const nextItems = sortItemsByCompletion(mutator(p.items));
        return { ...p, items: nextItems };
      }),
    );
  }
  function setPlanos(updater) {
    setData((d) => ({
      ...d,
      areas: d.areas.map((a) =>
        a.id !== areaId
          ? a
          : {
              ...a,
              clientes: a.clientes.map((c) =>
                c.id !== clienteId ? c : { ...c, planos: updater(c.planos) },
              ),
            },
      ),
    }));
  }
  function updatePlanoPatch(patch) {
    setPlanos((planos) => planos.map((p) => (p.id !== planoId ? p : { ...p, ...patch })));
  }
  function createRiskAssessmentItems(rows) {
    const actionableRows = (rows || []).filter((row) => row.atende !== "S");
    if (!actionableRows.length) return;
    setPlanos((planos) =>
      updateItemsAndResort(planos, planoId, (items) => {
        const existing = new Set(items.map((item) => item.riskAssessmentId).filter(Boolean));
        const newItems = actionableRows
          .filter((row) => !existing.has(row.id))
          .map((row) => ({
            id: `it${uid()}`,
            name: row.planoAcao || row.sugestao || row.assunto || "Acao de Risk Assessment",
            tipo: row.tipoRisco === "Documentos e Politicas" ? "Documento" : "Processo",
            responsavel: "",
            responsaveis: [],
            status: "Nao iniciado",
            kanbanStatus: "Suspenso",
            prazo: "",
            riskAssessmentId: row.id,
            etiquetas: [
              {
                id: `tag${uid()}`,
                nome: row.importancia === "Alta" ? "Alta prioridade" : "Risk Assessment",
                cor: row.importancia === "Alta" ? "#EF4444" : "#3B82F6",
              },
            ],
            obs: [
              `Origem: Risk Assessment`,
              `Assunto: ${row.assunto || "-"}`,
              `Area: ${row.area || "-"}`,
              `Risco: ${row.tipoRisco || "-"}`,
              `Atende: ${row.atende || "-"}`,
              `Sugestao: ${row.sugestao || "-"}`,
            ].join("\n"),
          }));
        return [...items, ...newItems];
      }),
    );
    updatePlanoPatch({
      riskAssessment: {
        ...(plano.riskAssessment || {}),
        lastItemSyncAt: new Date().toISOString(),
      },
    });
  }
  function addItem() {
    if (!newName.trim()) return;
    const nome = newName.trim();
    const agora = new Date().toISOString();
    const item = {
      id: `it${uid()}`,
      name: nome,
      tipo: newTipo,
      responsavel: newResp.trim(),
      // quem cria ja entra como responsavel
      responsaveis: currentUser ? [currentUser.id] : [],
      status: "Não iniciado",
      kanbanStatus: "A Fazer",
      obs: "",
      prazo: "",
      dataInicio: todayBR(),
      criadoEm: agora,
      statusChangedAt: agora,
      // demandas conhecidas ja trazem a checklist pronta
      checklist: checklistTemplateFor(nome).map((t) => ({ id: `ck${uid()}`, text: t, done: false })),
    };
    setPlanos((planos) => updateItemsAndResort(planos, planoId, (items) => [...items, item]));
    setNewName("");
    setNewResp("");
    setShowForm(false);
  }
  function updateItem(itemId, field, val) {
    setPlanos((planos) =>
      updateItemsAndResort(planos, planoId, (items) =>
        items.map((it) => (it.id !== itemId ? it : { ...it, [field]: val })),
      ),
    );
  }
  function setItemStatus(item, val) {
    updateItem(item.id, "kanbanStatus", val);
    emitMudancaStatus({
      responsibleIds: item.responsaveis || [],
      novoStatus: val,
      ctx: {
        cliente_id: clienteId,
        cliente_nome: cliente?.name || "",
        modulo: moduloOf(areaId),
        plano_id: planoId,
        plano_nome: plano?.name || "",
        item_id: item.id,
        item_nome: item.name,
        autor_id: currentUser?.id || null,
        autor_nome: currentProfile?.display_name || currentUser?.email || "sistema",
        trecho: `Status alterado para "${val}"`,
      },
    });
  }
  function removeItem(itemId) {
    setPlanos((planos) =>
      updateItemsAndResort(planos, planoId, (items) => items.filter((it) => it.id !== itemId)),
    );
  }
  function moveItem(itemId, dir) {
    setPlanos((planos) =>
      planos.map((p) => {
        if (p.id !== planoId) return p;
        const idx = p.items.findIndex((it) => it.id === itemId);
        if (idx < 0) return p;
        return { ...p, items: moveInArray(p.items, idx, dir) };
      }),
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 22,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => nav({ page: "dashboard" })}
          style={{
            color: "#94A3B8",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          Painel
        </button>
        <ChevronRight size={13} color="#334155" />
        <button
          onClick={() => nav({ page: "area", areaId })}
          style={{
            color: "#94A3B8",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          {area.name}
        </button>
        <ChevronRight size={13} color="#334155" />
        <button
          onClick={() => nav({ page: "cliente", areaId, clienteId })}
          style={{
            color: "#94A3B8",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          {cliente.name}
        </button>
        <ChevronRight size={13} color="#334155" />
        <span style={{ color: "#64748B", fontSize: 12, fontWeight: 600 }}>{plano.name}</span>
      </div>

      {/* Header */}
      <div
        style={{
          background: "#FFFFFF",
          border: `1px solid ${area.color}30`,
          borderRadius: 16,
          padding: 24,
          marginBottom: 22,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <FolderOpen size={20} color={area.color} />
            <h2 style={{ color: "#0F172A", fontSize: 20, fontWeight: 900 }}>{plano.name}</h2>
          </div>
          <p style={{ color: "#64748B", fontSize: 12 }}>
            {cliente.name} · {area.name}
          </p>
          {plano.responsavel && (
            <p style={{ color: "#64748B", fontSize: 12, marginTop: 4 }}>
              <User size={11} style={{ display: "inline", marginRight: 4 }} />
              Responsável: {plano.responsavel}
            </p>
          )}
          <p style={{ color: "#64748B", fontSize: 12, marginTop: 8 }}>
            {done}/{total} itens concluídos
          </p>
        </div>
        <div
          style={{
            position: "relative",
            width: 90,
            height: 90,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Ring pct={pct} color={area.color} size={90} stroke={8} />
          <div style={{ position: "absolute", textAlign: "center" }}>
            <p style={{ color: "#0F172A", fontSize: 16, fontWeight: 900 }}>{pct}%</p>
          </div>
        </div>
      </div>

      {isRiskAssessmentPlan(plano) && (
        <RiskAssessmentPanel
          area={area}
          cliente={cliente}
          plano={plano}
          onAssessmentChange={(riskAssessment) => updatePlanoPatch({ riskAssessment })}
          onCreateItems={createRiskAssessmentItems}
        />
      )}

      {/* Add item button / form */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 20,
            background: `${area.color}18`,
            border: `1px dashed ${area.color}50`,
            borderRadius: 10,
            color: area.color,
            fontSize: 13,
            fontWeight: 700,
            padding: "10px 18px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <Plus size={15} /> Adicionar Item
        </button>
      ) : (
        <div
          style={{
            background: "#FFFFFF",
            border: `1px solid ${area.color}30`,
            borderRadius: 12,
            padding: 18,
            marginBottom: 20,
          }}
        >
          <p
            style={{
              color: area.color,
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 12,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Novo Item
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select
              value={newTipo}
              onChange={(e) => setNewTipo(e.target.value)}
              style={{
                ...inp,
                width: 160,
                cursor: "pointer",
              }}
            >
              {TIPOS_ITEM.map((t) => (
                <option key={t} value={t} style={{ background: "#F8FAFC" }}>
                  {t}
                </option>
              ))}
            </select>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="Nome do item..."
              style={{ ...inp, flex: 1, minWidth: 200 }}
            />
            <input
              value={newResp}
              onChange={(e) => setNewResp(e.target.value)}
              placeholder="Responsável..."
              style={{ ...inp, width: 180 }}
            />
            <button
              onClick={addItem}
              style={{
                background: area.color,
                border: "none",
                borderRadius: 8,
                padding: "7px 14px",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "inherit",
              }}
            >
              <Plus size={14} /> Adicionar
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{
                background: "#F1F5F9",
                border: "1px solid #2a3550",
                borderRadius: 8,
                padding: "7px 12px",
                color: "#64748B",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                fontFamily: "inherit",
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Items table */}
      {plano.items.length === 0 ? (
        <div
          style={{
            background: "#FFFFFF",
            border: "1px dashed #1e2d45",
            borderRadius: 14,
            padding: 40,
            textAlign: "center",
          }}
        >
          <p style={{ color: "#94A3B8", fontSize: 13, fontWeight: 600 }}>Nenhum item neste plano</p>
          <p style={{ color: "#E2E8F0", fontSize: 12, marginTop: 4 }}>
            Adicione organogramas, políticas, procedimentos e mais
          </p>
        </div>
      ) : (
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E2E8F0",
            borderRadius: 16,
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "130px 1fr 160px 180px 155px 60px 36px",
              gap: 12,
              padding: "14px 22px",
              borderBottom: "1px solid #E2E8F0",
              background: "#F8FAFC",
              borderRadius: "16px 16px 0 0",
            }}
          >
            {["Tipo", "Nome do Item", "Responsável", "Observação", "Status", "Mover", ""].map(
              (h, i) => (
                <span
                  key={i}
                  style={{
                    color: "#94A3B8",
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.7,
                  }}
                >
                  {h}
                </span>
              ),
            )}
          </div>
          {plano.items.map((item, idx) => {
            const itemDone = getItemKanbanStatus(item) === "Finalizado";
            const isDragging = dragItemId === item.id;
            const isDragOver = dragOverItemId === item.id && dragItemId !== item.id;
            return (
              <div
                key={item.id}
                id={`item-${item.id}`}
                draggable
                onDragStart={(e) => {
                  setDragItemId(item.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverItemId !== item.id) setDragOverItemId(item.id);
                }}
                onDragLeave={() => {
                  if (dragOverItemId === item.id) setDragOverItemId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  reorderItems(dragItemId, item.id);
                  setDragItemId(null);
                  setDragOverItemId(null);
                }}
                onDragEnd={() => {
                  setDragItemId(null);
                  setDragOverItemId(null);
                }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "130px 1fr 160px 180px 155px 60px 36px",
                  alignItems: "center",
                  gap: 12,
                  padding: "16px 22px",
                  borderBottom: idx < plano.items.length - 1 ? "1px solid #F1F5F9" : "none",
                  transition: "background 0.15s, box-shadow 0.15s",
                  opacity: isDragging ? 0.4 : itemDone ? 0.7 : 1,
                  boxShadow: isDragOver ? `inset 0 2px 0 ${area.color}` : "none",
                  cursor: "grab",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span
                  style={{
                    padding: "5px 10px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    background: `${area.color}15`,
                    color: area.color,
                    border: `1px solid ${area.color}30`,
                    display: "inline-block",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.tipo}
                </span>

                <button
                  type="button"
                  draggable={false}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setModalItemId(item.id);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <p
                    style={{
                      color: "#1E293B",
                      fontSize: 14,
                      fontWeight: 500,
                      lineHeight: 1.4,
                      textDecoration: itemDone ? "line-through" : "none",
                    }}
                  >
                    {item.name}
                  </p>
                </button>

                <ResponsaveisPicker
                  value={item.responsaveis || []}
                  onChange={(ids) => {
                    const old = item.responsaveis || [];
                    updateItem(item.id, "responsaveis", ids);
                    emitAtribuicao({
                      newIds: ids,
                      oldIds: old,
                      ctx: {
                        cliente_id: clienteId,
                        cliente_nome: cliente?.name || "",
                        modulo: moduloOf(areaId),
                        plano_id: planoId,
                        plano_nome: plano?.name || "",
                        item_id: item.id,
                        item_nome: item.name,
                        autor_id: currentUser?.id || null,
                        autor_nome: currentProfile?.display_name || currentUser?.email || "Alguém",
                        trecho: `Adicionado como responsável em "${item.name}"`,
                      },
                    });
                  }}
                  compact
                  label="Resp."
                />

                <MentionTextarea
                  value={item.obs || ""}
                  onChange={(value) => updateItem(item.id, "obs", value)}
                  placeholder="Observação..."
                  rows={1}
                />

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <StatusPill
                    status={getItemKanbanStatus(item)}
                    onChange={(val) => setItemStatus(item, val)}
                  />
                  {getItemKanbanStatus(item) === "Suspenso" && (
                    <button
                      onClick={() => setItemStatus(item, "A Fazer")}
                      style={{
                        background: "#ECFEFF",
                        border: "1px solid #67E8F9",
                        color: "#0891B2",
                        borderRadius: 7,
                        padding: "5px 7px",
                        fontSize: 10,
                        fontWeight: 800,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Enviar ao quadro
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", gap: 3 }}>
                  <button
                    onClick={() => moveItem(item.id, -1)}
                    disabled={idx === 0}
                    title="Mover para cima"
                    style={{
                      background: "#F1F5F9",
                      border: "1px solid #E2E8F0",
                      borderRadius: 6,
                      color: "#475569",
                      padding: "4px 5px",
                      cursor: idx === 0 ? "not-allowed" : "pointer",
                      display: "flex",
                      opacity: idx === 0 ? 0.4 : 1,
                    }}
                  >
                    <ArrowUp size={11} />
                  </button>
                  <button
                    onClick={() => moveItem(item.id, 1)}
                    disabled={idx === plano.items.length - 1}
                    title="Mover para baixo"
                    style={{
                      background: "#F1F5F9",
                      border: "1px solid #E2E8F0",
                      borderRadius: 6,
                      color: "#475569",
                      padding: "4px 5px",
                      cursor: idx === plano.items.length - 1 ? "not-allowed" : "pointer",
                      display: "flex",
                      opacity: idx === plano.items.length - 1 ? 0.4 : 1,
                    }}
                  >
                    <ArrowDown size={11} />
                  </button>
                </div>

                <button
                  onClick={() => removeItem(item.id)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#CBD5E1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 6,
                    borderRadius: 8,
                    transition: "color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#ef4444";
                    e.currentTarget.style.background = "#FEE2E2";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#CBD5E1";
                    e.currentTarget.style.background = "none";
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {modalItemId && (
        <ItemModal
          areaId={areaId}
          clienteId={clienteId}
          planoId={planoId}
          itemId={modalItemId}
          onClose={() => setModalItemId(null)}
        />
      )}
    </div>
  );
}

// ─── Produtos View ─────────────────────────────────────────────────────────────
const PRESET_COLORS = [
  "#8B5CF6",
  "#06B6D4",
  "#10B981",
  "#F59E0B",
  "#EC4899",
  "#F97316",
  "#3B82F6",
  "#EF4444",
  "#0DD3C5",
  "#84CC16",
];
const PRESET_EMOJIS = [
  "📊",
  "📄",
  "📑",
  "🔍",
  "🛡️",
  "💡",
  "🚀",
  "📋",
  "🔒",
  "⚙️",
  "🎯",
  "📈",
  "🤝",
  "💼",
  "🌐",
];

function isCommercialProduct(prod) {
  const name = normalizeRiskText(`${prod?.name || ""} ${prod?.descricao || ""}`);
  return name.includes("comercial") || name.includes("vendas") || name.includes("proposta");
}

function profileIdsFromMentions(line = "", profiles = []) {
  const usernames = [...String(line).matchAll(/@([a-zA-Z0-9._-]+)/g)].map((m) =>
    normalizeRiskText(m[1]),
  );
  if (!usernames.length) return [];
  return profiles
    .filter((profile) => usernames.includes(normalizeRiskText(profile.username || "")))
    .map((profile) => profile.id);
}

function todoLinesFromAta(text = "") {
  const cleaned = String(text).replace(/\r/g, "\n");
  const rawLines = cleaned.split("\n");
  const todoIndex = rawLines.findIndex((line) =>
    /^(to[\s-]?do|tarefas|tasks|encaminhamentos)\s*:?\s*$/i.test(normalizeRiskText(line.trim())),
  );
  if (todoIndex < 0) return [];
  const lines = [];
  for (const rawLine of rawLines.slice(todoIndex + 1)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const normalized = normalizeRiskText(trimmed);
    const isBullet = /^[\s\-•*0-9.)]+/.test(rawLine);
    const looksLikeHeading =
      !isBullet &&
      !trimmed.includes("@") &&
      trimmed.length < 80 &&
      /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9][^.!?]*$/.test(trimmed);
    if (looksLikeHeading && lines.length) break;
    if (normalized === "to-do" || normalized === "todo") continue;
    lines.push(trimmed);
  }
  return lines;
}

function extractAtaTasks(text = "", title = "Ata comercial", profiles = []) {
  const todoLines = todoLinesFromAta(text);
  if (todoLines.length) {
    const unique = [];
    todoLines.forEach((line) => {
      const responsaveis = profileIdsFromMentions(line, profiles);
      const name = line
        .replace(/^[\s\-•*0-9.)]+/, "")
        .replace(/@([a-zA-Z0-9._-]+)/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (name.length < 6) return;
      if (unique.some((task) => normalizeRiskText(task.name) === normalizeRiskText(name))) return;
      unique.push({ name: name.slice(0, 180), responsaveis, original: line });
    });
    return unique.slice(0, 30);
  }

  const cleaned = String(text).replace(/\r/g, "\n");
  const lines = cleaned
    .split("\n")
    .map((line) => line.replace(/^[\s\-•*0-9.)]+/, "").trim())
    .filter(Boolean);
  const actionWords = [
    "acao",
    "task",
    "tarefa",
    "encaminhamento",
    "responsavel",
    "prazo",
    "deve",
    "precisa",
    "ficou definido",
    "vamos",
    "enviar",
    "criar",
    "validar",
    "revisar",
    "agendar",
    "retornar",
    "preparar",
    "apresentar",
    "cobrar",
    "alinhar",
  ];
  const candidates = lines.filter((line) => {
    const normalized = normalizeRiskText(line);
    return actionWords.some((word) => normalized.includes(word));
  });
  const source = candidates.length ? candidates : lines.slice(0, 6);
  const unique = [];
  source.forEach((line) => {
    const responsaveis = profileIdsFromMentions(line, profiles);
    const name = line
      .replace(/^(acao|task|tarefa|encaminhamento)\s*[:-]\s*/i, "")
      .replace(/@([a-zA-Z0-9._-]+)/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (name.length < 8) return;
    if (unique.some((task) => normalizeRiskText(task.name) === normalizeRiskText(name))) return;
    unique.push({ name: name.slice(0, 180), responsaveis, original: line });
  });
  if (!unique.length && cleaned.trim()) {
    unique.push({
      name: `Revisar ata e definir proximos passos: ${title}`,
      responsaveis: [],
      original: title,
    });
  }
  return unique.slice(0, 12);
}

function ProdutosView({ data, setData, nav }) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newEmoji, setNewEmoji] = useState("🚀");
  const [newColor, setNewColor] = useState("#8B5CF6");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Count clients using Canal de Ética across all areas
  const canalEticaClients = data.areas.flatMap((a) =>
    a.clientes.filter((c) => c.canalEtica).map((c) => ({ ...c, area: a.name })),
  );

  function addProduto() {
    if (!newName.trim()) return;
    const prod = {
      id: `prod${uid()}`,
      name: newName.trim(),
      emoji: newEmoji,
      color: newColor,
      responsavel: "",
      descricao: newDesc.trim() || "Novo produto Adeke",
      items: [],
      notas: [],
      informacoes: [],
    };
    setData((d) => ({ ...d, produtos: [...d.produtos, prod] }));
    setNewName("");
    setNewDesc("");
    setNewEmoji("🚀");
    setNewColor("#8B5CF6");
    setShowForm(false);
    nav({ page: "produto", prodId: prod.id });
  }

  function removeProduto(e, pId) {
    e.stopPropagation();
    if (!confirm("Remover este produto?")) return;
    setData((d) => ({ ...d, produtos: d.produtos.filter((p) => p.id !== pId) }));
  }

  return (
    <div>
      <button
        onClick={() => nav({ page: "dashboard" })}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "#64748B",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 13,
          marginBottom: 22,
          fontFamily: "inherit",
        }}
      >
        <ArrowLeft size={15} /> Voltar ao Painel
      </button>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 22,
        }}
      >
        <h2 style={{ color: "#0F172A", fontSize: 20, fontWeight: 900 }}>
          <span style={{ color: "#8B5CF6" }}>Produtos</span> & Soluções
        </h2>
        <button
          onClick={() => setShowForm((f) => !f)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "9px 18px",
            background: showForm ? "#F1F5F9" : "#8B5CF6",
            border: showForm ? "1px solid #E2E8F0" : "none",
            borderRadius: 10,
            color: showForm ? "#64748B" : "#fff",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {showForm ? <X size={15} /> : <Plus size={15} />} {showForm ? "Cancelar" : "Novo Produto"}
        </button>
      </div>

      {/* ── Add Product Form ── */}
      {showForm && (
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid #E2E8F0",
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          }}
        >
          <p
            style={{
              color: "#8B5CF6",
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 18,
            }}
          >
            Novo Produto ou Solução
          </p>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
            {/* Emoji picker */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowEmojiPicker((p) => !p)}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 12,
                  fontSize: 26,
                  border: "2px solid #E2E8F0",
                  background: "#F8FAFC",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {newEmoji}
              </button>
              {showEmojiPicker && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    left: 0,
                    zIndex: 99,
                    background: "#FFFFFF",
                    border: "1px solid #E2E8F0",
                    borderRadius: 12,
                    padding: 12,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    width: 220,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                  }}
                >
                  {PRESET_EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        setNewEmoji(e);
                        setShowEmojiPicker(false);
                      }}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        fontSize: 20,
                        border: e === newEmoji ? "2px solid #8B5CF6" : "1px solid #E2E8F0",
                        background: e === newEmoji ? "#F5F3FF" : "#F8FAFC",
                        cursor: "pointer",
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 200 }}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addProduto()}
                placeholder="Nome do produto ou solução..."
                style={{
                  ...inp,
                  width: "100%",
                  fontSize: 15,
                  fontWeight: 700,
                  marginBottom: 8,
                  padding: "10px 14px",
                }}
              />
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Descrição (opcional)..."
                style={{ ...inp, width: "100%", fontSize: 13 }}
              />
            </div>
          </div>

          {/* Color swatches */}
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginBottom: 18,
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: "#64748B", fontSize: 12, fontWeight: 600 }}>Cor:</span>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: c,
                  border: c === newColor ? `3px solid #0F172A` : "2px solid transparent",
                  cursor: "pointer",
                  transform: c === newColor ? "scale(1.15)" : "scale(1)",
                  transition: "transform 0.1s",
                }}
              />
            ))}
          </div>

          {/* Preview & Save */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: `${newColor}10`,
                border: `1px solid ${newColor}30`,
                borderRadius: 10,
                padding: "8px 14px",
              }}
            >
              <span style={{ fontSize: 20 }}>{newEmoji}</span>
              <div>
                <p style={{ color: newColor, fontSize: 13, fontWeight: 800 }}>
                  {newName || "Nome do produto"}
                </p>
                <p style={{ color: "#94A3B8", fontSize: 11 }}>{newDesc || "Descrição"}</p>
              </div>
            </div>
            <button
              onClick={addProduto}
              style={{
                background: newColor,
                border: "none",
                borderRadius: 10,
                padding: "10px 22px",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontSize: 13,
                fontWeight: 800,
                fontFamily: "inherit",
              }}
            >
              <Plus size={15} /> Criar Produto
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {data.produtos.map((p) => {
          const { total: t, done: d, pct } = prog(p.items);
          // If Canal de Ética, show client count
          const isCanal = p.isCanalEtica;
          return (
            <button
              key={p.id}
              onClick={() => nav({ page: "produto", prodId: p.id })}
              style={{
                background: "#FFFFFF",
                border: `1px solid ${p.color}28`,
                borderRadius: 16,
                padding: 24,
                cursor: "pointer",
                textAlign: "left",
                transition: "border-color 0.15s, background 0.15s",
                position: "relative",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${p.color}60`;
                e.currentTarget.style.background = `${p.color}06`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = `${p.color}28`;
                e.currentTarget.style.background = "#FFFFFF";
              }}
            >
              {/* Remove button (for non-built-in products) */}
              {!["financeiro", "proposta", "contractia", "crivo", "canal-etica"].includes(p.id) && (
                <button
                  onClick={(e) => removeProduto(e, p.id)}
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    background: "#FEE2E2",
                    border: "1px solid #FCA5A5",
                    borderRadius: 7,
                    color: "#ef4444",
                    padding: "4px 6px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <Trash2 size={11} />
                </button>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ flex: 1, marginRight: 14 }}>
                  <div style={{ fontSize: 26, marginBottom: 10 }}>{p.emoji}</div>
                  <p style={{ color: "#0F172A", fontSize: 17, fontWeight: 900, marginBottom: 4 }}>
                    {p.name}
                  </p>
                  <p style={{ color: "#64748B", fontSize: 12, marginBottom: 16 }}>{p.descricao}</p>

                  {/* Canal de Ética: show linked clients */}
                  {isCanal ? (
                    <div style={{ marginBottom: 12 }}>
                      {canalEticaClients.length === 0 ? (
                        <span style={{ fontSize: 11, color: "#94A3B8", fontStyle: "italic" }}>
                          Nenhum cliente vinculado ainda
                        </span>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {canalEticaClients.map((c) => (
                            <span
                              key={c.id}
                              style={{
                                padding: "3px 9px",
                                borderRadius: 20,
                                fontSize: 10,
                                fontWeight: 700,
                                background: "#FDF2F8",
                                color: "#EC4899",
                                border: "1px solid #EC489930",
                              }}
                            >
                              🏢 {c.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 6,
                        }}
                      >
                        <span style={{ color: "#64748B", fontSize: 11 }}>
                          {d}/{t} etapas
                        </span>
                        <span style={{ color: p.color, fontSize: 11, fontWeight: 700 }}>
                          {pct}%
                        </span>
                      </div>
                      <Bar2 pct={pct} color={p.color} />
                    </>
                  )}

                  <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                    {(p.notas || []).length > 0 && (
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 20,
                          fontSize: 10,
                          fontWeight: 600,
                          background: "#E2E8F0",
                          color: "#64748B",
                        }}
                      >
                        📝 {p.notas.length} nota{p.notas.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {(p.informacoes || []).length > 0 && (
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 20,
                          fontSize: 10,
                          fontWeight: 600,
                          background: "#E2E8F0",
                          color: "#64748B",
                        }}
                      >
                        ℹ️ {p.informacoes.length} info
                      </span>
                    )}
                    {isCanal && canalEticaClients.length > 0 && (
                      <span
                        style={{
                          padding: "2px 10px",
                          borderRadius: 20,
                          fontSize: 10,
                          fontWeight: 700,
                          background: "#FDF2F8",
                          color: "#EC4899",
                          border: "1px solid #EC489930",
                        }}
                      >
                        🛡️ {canalEticaClients.length} cliente
                        {canalEticaClients.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    position: "relative",
                    width: 80,
                    height: 80,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Ring
                    pct={
                      isCanal
                        ? Math.round(
                            (canalEticaClients.length /
                              Math.max(data.areas.flatMap((a) => a.clientes).length, 1)) *
                              100,
                          )
                        : pct
                    }
                    color={p.color}
                    size={80}
                  />
                  <span
                    style={{
                      position: "absolute",
                      color: "#0F172A",
                      fontSize: isCanal ? 13 : 14,
                      fontWeight: 800,
                    }}
                  >
                    {isCanal ? `${canalEticaClients.length}cl` : `${pct}%`}
                  </span>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  color: p.color,
                  fontSize: 11,
                  fontWeight: 700,
                  marginTop: 14,
                  justifyContent: "flex-end",
                }}
              >
                Ver produto <ChevronRight size={13} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Produto Detail ────────────────────────────────────────────────────────────
function ProdutoDetail({ prodId, data, setData, nav }) {
  const prod = data.produtos.find((p) => p.id === prodId);
  const isComercial = isCommercialProduct(prod);
  const profiles = useProfiles();
  const [tab, setTab] = useState(isComercial ? "notas" : "roadmap");
  const [newInfoCampo, setNewInfoCampo] = useState("");
  const [newInfoValor, setNewInfoValor] = useState("");
  const [newNotaTitulo, setNewNotaTitulo] = useState("");
  const [newNotaTexto, setNewNotaTexto] = useState("");
  const [newEtapa, setNewEtapa] = useState("");
  const [expandedAtaId, setExpandedAtaId] = useState(null);

  useEffect(() => {
    if (isComercial && tab === "info") setTab("notas");
  }, [isComercial, tab]);

  if (!prod) return null;
  const { total: t, done: d, pct } = prog(prod.items);

  const upd = (field, val) =>
    setData((dd) => ({
      ...dd,
      produtos: dd.produtos.map((p) => (p.id !== prodId ? p : { ...p, [field]: val })),
    }));
  const setStatus = (itemId, val) =>
    setData((dd) => ({
      ...dd,
      produtos: dd.produtos.map((p) =>
        p.id !== prodId
          ? p
          : {
              ...p,
              items: p.items.map((it) =>
                it.id !== itemId ? it : { ...it, status: val, kanbanStatus: val },
              ),
            },
      ),
    }));
  const setObs = (iIdx, val) =>
    setData((dd) => ({
      ...dd,
      produtos: dd.produtos.map((p) =>
        p.id !== prodId
          ? p
          : {
              ...p,
              items: p.items.map((it, i) => (i !== iIdx ? it : { ...it, obs: val })),
            },
      ),
    }));
  const setPrazo = (iIdx, val) =>
    setData((dd) => ({
      ...dd,
      produtos: dd.produtos.map((p) =>
        p.id !== prodId
          ? p
          : {
              ...p,
              items: p.items.map((it, i) => (i !== iIdx ? it : { ...it, prazo: val })),
            },
      ),
    }));
  const setEtapaResponsaveis = (iIdx, ids) =>
    setData((dd) => ({
      ...dd,
      produtos: dd.produtos.map((p) =>
        p.id !== prodId
          ? p
          : {
              ...p,
              items: p.items.map((it, i) => (i !== iIdx ? it : { ...it, responsaveis: ids })),
            },
      ),
    }));
  const addEtapa = () => {
    if (!newEtapa.trim()) return;
    const item = {
      id: `e${uid()}`,
      name: newEtapa.trim(),
      status: "A Fazer",
      kanbanStatus: "A Fazer",
      prazo: "",
      obs: "",
    };
    setData((dd) => ({
      ...dd,
      produtos: dd.produtos.map((p) => (p.id !== prodId ? p : { ...p, items: [...p.items, item] })),
    }));
    setNewEtapa("");
  };
  const removeEtapa = (iIdx) => {
    setData((dd) => ({
      ...dd,
      produtos: dd.produtos.map((p) =>
        p.id !== prodId ? p : { ...p, items: p.items.filter((_, i) => i !== iIdx) },
      ),
    }));
  };

  // Informações
  const addInfo = () => {
    if (!newInfoCampo.trim()) return;
    const info = { id: `inf${uid()}`, campo: newInfoCampo.trim(), valor: newInfoValor.trim() };
    setData((dd) => ({
      ...dd,
      produtos: dd.produtos.map((p) =>
        p.id !== prodId ? p : { ...p, informacoes: [...(p.informacoes || []), info] },
      ),
    }));
    setNewInfoCampo("");
    setNewInfoValor("");
  };
  const removeInfo = (id) =>
    setData((dd) => ({
      ...dd,
      produtos: dd.produtos.map((p) =>
        p.id !== prodId ? p : { ...p, informacoes: p.informacoes.filter((i) => i.id !== id) },
      ),
    }));
  const updateInfoValor = (id, val) =>
    setData((dd) => ({
      ...dd,
      produtos: dd.produtos.map((p) =>
        p.id !== prodId
          ? p
          : {
              ...p,
              informacoes: p.informacoes.map((i) => (i.id !== id ? i : { ...i, valor: val })),
            },
      ),
    }));

  // Notas
  const addNota = () => {
    if (!newNotaTitulo.trim() && !newNotaTexto.trim()) return;
    const nota = {
      id: `nota${uid()}`,
      titulo: newNotaTitulo.trim() || (isComercial ? "Ata sem título" : "Sem título"),
      texto: newNotaTexto.trim(),
      data: new Date().toLocaleDateString("pt-BR"),
      tipo: isComercial ? "ata" : "nota",
      createdAt: new Date().toISOString(),
    };
    setData((dd) => ({
      ...dd,
      produtos: dd.produtos.map((p) =>
        p.id !== prodId
          ? p
          : { ...p, notas: isComercial ? [nota, ...(p.notas || [])] : [...(p.notas || []), nota] },
      ),
    }));
    setNewNotaTitulo("");
    setNewNotaTexto("");
  };
  const removeNota = (id) =>
    setData((dd) => ({
      ...dd,
      produtos: dd.produtos.map((p) =>
        p.id !== prodId ? p : { ...p, notas: p.notas.filter((n) => n.id !== id) },
      ),
    }));
  const updateNotaTexto = (id, val) =>
    setData((dd) => ({
      ...dd,
      produtos: dd.produtos.map((p) =>
        p.id !== prodId
          ? p
          : {
              ...p,
              notas: p.notas.map((n) => (n.id !== id ? n : { ...n, texto: val })),
            },
      ),
    }));
  const gerarTasksDaAta = (nota) => {
    const tasksFromAta = extractAtaTasks(nota.texto, nota.titulo, profiles);
    if (!tasksFromAta.length) return;
    setData((dd) => ({
      ...dd,
      produtos: dd.produtos.map((p) => {
        if (p.id !== prodId) return p;
        const existing = new Set(
          (p.items || [])
            .filter((item) => item.sourceAtaId === nota.id)
            .map((item) => normalizeRiskText(item.name)),
        );
        const tasks = tasksFromAta
          .filter((task) => !existing.has(normalizeRiskText(task.name)))
          .map((task) => ({
            id: `e${uid()}`,
            name: task.name,
            status: "A Fazer",
            kanbanStatus: "A Fazer",
            prazo: "",
            obs: `Gerado a partir da ata "${nota.titulo}" (${nota.data}).\nLinha original: ${task.original}`,
            responsaveis: task.responsaveis,
            sourceAtaId: nota.id,
          }));
        return {
          ...p,
          items: [...(p.items || []), ...tasks],
          notas: (p.notas || []).map((n) =>
            n.id !== nota.id
              ? n
              : {
                  ...n,
                  tasksGeradas: [...(n.tasksGeradas || []), ...tasks.map((task) => task.id)],
                  ultimaGeracaoTasks: new Date().toLocaleString("pt-BR"),
                },
          ),
        };
      }),
    }));
    setTab("roadmap");
  };

  const tabs = isComercial
    ? [
        { id: "notas", label: "Atas", count: (prod.notas || []).length },
        { id: "roadmap", label: "Tasks", count: prod.items.length },
      ]
    : [
        { id: "roadmap", label: "Roadmap", count: prod.items.length },
        { id: "info", label: "Informações", count: (prod.informacoes || []).length },
        { id: "notas", label: "Notas", count: (prod.notas || []).length },
      ];

  // Canal de Ética: count linked clients
  const canalEticaClients = prod.isCanalEtica
    ? data.areas.flatMap((a) =>
        a.clientes
          .filter((c) => c.canalEtica)
          .map((c) => ({ ...c, areaName: a.name, areaColor: a.color })),
      )
    : [];

  return (
    <div>
      <button
        onClick={() => nav({ page: "produtos" })}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "#64748B",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 13,
          marginBottom: 22,
          fontFamily: "inherit",
        }}
      >
        <ArrowLeft size={15} /> Voltar a Produtos
      </button>

      {/* Header */}
      <div
        style={{
          background: "#FFFFFF",
          border: `1px solid ${prod.color}30`,
          borderRadius: 16,
          padding: 26,
          marginBottom: 22,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 32 }}>{prod.emoji}</span>
              <div>
                <h2 style={{ color: "#0F172A", fontSize: 20, fontWeight: 900 }}>{prod.name}</h2>
                <MentionTextarea
                  value={prod.descricao}
                  onChange={(value) => upd("descricao", value)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#64748B",
                    fontSize: 12,
                    fontFamily: "inherit",
                    outline: "none",
                    width: 340,
                    padding: 0,
                  }}
                  placeholder="Descrição do produto..."
                />
              </div>
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: prod.isCanalEtica ? 16 : 0,
              }}
            >
              <User size={13} color="#475569" />
              <span style={{ color: "#64748B", fontSize: 12 }}>Responsável:</span>
              <input
                value={prod.responsavel}
                onChange={(e) => upd("responsavel", e.target.value)}
                placeholder="Nome do responsável..."
                style={{ ...inp, width: 200 }}
              />
            </label>

            {/* Canal de Ética: clientes vinculados */}
            {prod.isCanalEtica && (
              <div style={{ marginTop: 4 }}>
                <p style={{ color: "#64748B", fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                  🛡️ Clientes usando este canal:
                  {canalEticaClients.length === 0 && (
                    <span
                      style={{
                        color: "#94A3B8",
                        fontWeight: 400,
                        marginLeft: 6,
                        fontStyle: "italic",
                      }}
                    >
                      nenhum ainda — ative nas áreas de Compliance ou LGPD
                    </span>
                  )}
                </p>
                {canalEticaClients.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {canalEticaClients.map((c) => (
                      <span
                        key={c.id}
                        style={{
                          padding: "4px 12px",
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 700,
                          background: "#FDF2F8",
                          color: "#EC4899",
                          border: "1px solid #EC489940",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        🏢 {c.name}
                        <span style={{ color: "#F9A8D4", fontSize: 10 }}>· {c.areaName}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div
            style={{
              position: "relative",
              width: 100,
              height: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Ring
              pct={
                prod.isCanalEtica
                  ? Math.round(
                      (canalEticaClients.length /
                        Math.max(data.areas.flatMap((a) => a.clientes).length, 1)) *
                        100,
                    )
                  : pct
              }
              color={prod.color}
              size={100}
              stroke={9}
            />
            <div style={{ position: "absolute", textAlign: "center" }}>
              {prod.isCanalEtica ? (
                <>
                  <p style={{ color: "#0F172A", fontSize: 20, fontWeight: 900 }}>
                    {canalEticaClients.length}
                  </p>
                  <p style={{ color: "#64748B", fontSize: 10 }}>clientes</p>
                </>
              ) : (
                <>
                  <p style={{ color: "#0F172A", fontSize: 18, fontWeight: 900 }}>{pct}%</p>
                  <p style={{ color: "#64748B", fontSize: 10 }}>
                    {d}/{t}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 16px",
              borderRadius: 10,
              border: tab === tb.id ? `1px solid ${prod.color}40` : "1px solid #1e2d45",
              background: tab === tb.id ? `${prod.color}18` : "#FFFFFF",
              color: tab === tb.id ? prod.color : "#475569",
              fontSize: 13,
              fontWeight: tab === tb.id ? 700 : 500,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
            }}
          >
            {tb.id === "roadmap" ? (
              <Activity size={14} />
            ) : tb.id === "info" ? (
              <Info size={14} />
            ) : (
              <StickyNote size={14} />
            )}
            {tb.label}
            {tb.count > 0 && (
              <span
                style={{
                  background: tab === tb.id ? `${prod.color}30` : "#E2E8F0",
                  color: tab === tb.id ? prod.color : "#475569",
                  borderRadius: 20,
                  padding: "1px 7px",
                  fontSize: 10,
                  fontWeight: 800,
                }}
              >
                {tb.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Roadmap Tab ── */}
      {tab === "roadmap" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              value={newEtapa}
              onChange={(e) => setNewEtapa(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEtapa()}
              placeholder="Nome da nova etapa..."
              style={{ ...inp, flex: 1, fontSize: 13, padding: "9px 14px" }}
            />
            <button
              onClick={addEtapa}
              style={{
                background: prod.color,
                border: "none",
                borderRadius: 8,
                padding: "9px 14px",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "inherit",
              }}
            >
              <Plus size={14} /> Etapa
            </button>
          </div>

          <p
            style={{
              color: prod.color,
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 10,
            }}
          >
            {isComercial ? "Tasks geradas das atas" : "Roadmap & Etapas"}
          </p>
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: 16,
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            }}
          >
            {prod.items.map((item, iIdx) => (
              <div
                key={item.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "38px 1fr 150px 130px 190px auto 42px",
                  alignItems: "center",
                  gap: 16,
                  padding: "18px 26px",
                  borderBottom: iIdx < prod.items.length - 1 ? "1px solid #F1F5F9" : "none",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: getItemKanbanStatus(item) === "Finalizado" ? prod.color : "#EEF2F8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: getItemKanbanStatus(item) === "Finalizado" ? "#fff" : "#94A3B8",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  {getItemKanbanStatus(item) === "Finalizado" ? (
                    <CheckCircle size={15} />
                  ) : (
                    iIdx + 1
                  )}
                </div>
                <p style={{ color: "#1E293B", fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>
                  {item.name}
                </p>
                <ResponsaveisPicker
                  value={item.responsaveis || []}
                  onChange={(ids) => setEtapaResponsaveis(iIdx, ids)}
                  compact
                  label="Resp."
                />
                <input
                  value={item.prazo}
                  onChange={(e) => setPrazo(iIdx, e.target.value)}
                  placeholder="Prazo..."
                  style={{ ...inp, width: "100%", fontSize: 12 }}
                />
                <input
                  value={item.obs || ""}
                  onChange={(value) => setObs(iIdx, value)}
                  placeholder="Observação..."
                  rows={1}
                />
                <StatusPill
                  status={getItemKanbanStatus(item)}
                  onChange={(val) => setStatus(item.id, val)}
                />
                <button
                  onClick={() => removeEtapa(iIdx)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#CBD5E1",
                    padding: 6,
                    borderRadius: 8,
                    transition: "color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#ef4444";
                    e.currentTarget.style.background = "#FEE2E2";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#CBD5E1";
                    e.currentTarget.style.background = "none";
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {prod.items.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
                {isComercial
                  ? "Nenhuma task ainda. Salve uma ata e gere os encaminhamentos."
                  : "Nenhuma etapa cadastrada. Adicione a primeira etapa acima."}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Informações Tab ── */}
      {!isComercial && tab === "info" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <input
              value={newInfoCampo}
              onChange={(e) => setNewInfoCampo(e.target.value)}
              placeholder="Campo (ex: Mercado Alvo)..."
              style={{ ...inp, width: 200 }}
            />
            <input
              value={newInfoValor}
              onChange={(e) => setNewInfoValor(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addInfo()}
              placeholder="Valor..."
              style={{ ...inp, flex: 1 }}
            />
            <button
              onClick={addInfo}
              style={{
                background: prod.color,
                border: "none",
                borderRadius: 8,
                padding: "7px 14px",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "inherit",
              }}
            >
              <Plus size={14} /> Adicionar
            </button>
          </div>

          {(prod.informacoes || []).length === 0 ? (
            <div
              style={{
                background: "#FFFFFF",
                border: "1px dashed #1e2d45",
                borderRadius: 14,
                padding: 40,
                textAlign: "center",
              }}
            >
              <Info size={24} color="#E2E8F0" style={{ margin: "0 auto 10px" }} />
              <p style={{ color: "#94A3B8", fontSize: 13, fontWeight: 600 }}>
                Nenhuma informação cadastrada
              </p>
              <p style={{ color: "#E2E8F0", fontSize: 12, marginTop: 4 }}>
                Adicione campos como Mercado Alvo, Tecnologia, Parceiros, etc.
              </p>
            </div>
          ) : (
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #1e2d45",
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              {(prod.informacoes || []).map((info, idx) => (
                <div
                  key={info.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "200px 1fr 36px",
                    alignItems: "center",
                    gap: 12,
                    padding: "13px 18px",
                    borderBottom: idx < prod.informacoes.length - 1 ? "1px solid #111827" : "none",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: prod.color,
                        flexShrink: 0,
                      }}
                    />
                    <p style={{ color: prod.color, fontSize: 13, fontWeight: 700 }}>{info.campo}</p>
                  </div>
                  <input
                    value={info.valor}
                    onChange={(e) => updateInfoValor(info.id, e.target.value)}
                    placeholder="Valor..."
                    style={{ ...inp, width: "100%" }}
                  />
                  <button
                    onClick={() => removeInfo(info.id)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#94A3B8",
                      padding: 4,
                      borderRadius: 6,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#CBD5E1")}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Notas / Atas Tab ── */}
      {tab === "notas" && (
        <div>
          <div
            style={{
              background: "#FFFFFF",
              border: `1px solid ${prod.color}25`,
              borderRadius: 12,
              padding: 18,
              marginBottom: 20,
            }}
          >
            <p
              style={{
                color: prod.color,
                fontSize: 11,
                fontWeight: 700,
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {isComercial ? "Nova Ata Comercial" : "Nova Nota"}
            </p>
            <input
              value={newNotaTitulo}
              onChange={(e) => setNewNotaTitulo(e.target.value)}
              placeholder={isComercial ? "Título da ata..." : "Título da nota..."}
              style={{ ...inp, width: "100%", marginBottom: 8, fontSize: 13 }}
            />
            <MentionTextarea
              value={newNotaTexto}
              onChange={setNewNotaTexto}
              placeholder={
                isComercial
                  ? "Cole a ata da reunião comercial aqui. Inclua encaminhamentos, responsáveis e prazos para gerar tasks."
                  : "Escreva sua nota, observação ou informação importante..."
              }
              rows={isComercial ? 12 : 4}
              style={{
                minHeight: isComercial ? 260 : 110,
                fontSize: isComercial ? 13 : 12,
                lineHeight: 1.6,
              }}
            />
            <button
              onClick={addNota}
              style={{
                background: prod.color,
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "inherit",
              }}
            >
              <Plus size={14} /> {isComercial ? "Salvar Ata" : "Salvar Nota"}
            </button>
          </div>

          {(prod.notas || []).length === 0 ? (
            <div
              style={{
                background: "#FFFFFF",
                border: "1px dashed #1e2d45",
                borderRadius: 14,
                padding: 40,
                textAlign: "center",
              }}
            >
              <StickyNote size={24} color="#E2E8F0" style={{ margin: "0 auto 10px" }} />
              <p style={{ color: "#94A3B8", fontSize: 13, fontWeight: 600 }}>
                {isComercial ? "Nenhuma ata adicionada" : "Nenhuma nota adicionada"}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(prod.notas || []).map((nota) => {
                const ataExpanded = expandedAtaId === nota.id;
                return (
                  <div
                    key={nota.id}
                    style={{
                      background: "#FFFFFF",
                      border: `1px solid ${prod.color}20`,
                      borderRadius: 14,
                      padding: ataExpanded ? 26 : 20,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <p style={{ color: "#0F172A", fontSize: 14, fontWeight: 700 }}>
                          {nota.titulo}
                        </p>
                        <p style={{ color: "#64748B", fontSize: 11, marginTop: 2 }}>{nota.data}</p>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {isComercial && (
                          <button
                            onClick={() => setExpandedAtaId(ataExpanded ? null : nota.id)}
                            style={{
                              background: ataExpanded ? `${prod.color}18` : "#F8FAFC",
                              border: `1px solid ${ataExpanded ? `${prod.color}45` : "#E2E8F0"}`,
                              borderRadius: 8,
                              color: ataExpanded ? prod.color : "#475569",
                              padding: "6px 10px",
                              cursor: "pointer",
                              fontFamily: "inherit",
                              fontSize: 11,
                              fontWeight: 800,
                            }}
                          >
                            {ataExpanded ? "Recolher" : "Abrir documento"}
                          </button>
                        )}
                        <button
                          onClick={() => removeNota(nota.id)}
                          style={{
                            background: "#ef444415",
                            border: "1px solid #ef444430",
                            borderRadius: 7,
                            color: "#ef4444",
                            padding: "4px 8px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <MentionTextarea
                      value={nota.texto}
                      onChange={(value) => updateNotaTexto(nota.id, value)}
                      rows={isComercial ? (ataExpanded ? 30 : 12) : 3}
                      style={{
                        minHeight: isComercial ? (ataExpanded ? 620 : 260) : 90,
                        fontSize: isComercial ? 13 : 12,
                        lineHeight: 1.65,
                        padding: isComercial ? "14px 16px" : "8px 12px",
                      }}
                    />
                    {isComercial && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          marginTop: 12,
                          paddingTop: 12,
                          borderTop: "1px solid #F1F5F9",
                        }}
                      >
                        <span style={{ color: "#64748B", fontSize: 11, fontWeight: 600 }}>
                          {(nota.tasksGeradas || []).length > 0
                            ? `${nota.tasksGeradas.length} task(s) geradas desta ata`
                            : "Nenhuma task gerada desta ata"}
                        </span>
                        <button
                          onClick={() => gerarTasksDaAta(nota)}
                          style={{
                            background: prod.color,
                            border: "none",
                            borderRadius: 8,
                            color: "#fff",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontFamily: "inherit",
                            fontSize: 12,
                            fontWeight: 800,
                            padding: "8px 12px",
                          }}
                        >
                          <Plus size={13} /> Gerar tasks da ata
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── NAV Config ───────────────────────────────────────────────────────────────
const NAV = [
  {
    id: "dashboard",
    label: "Painel Geral",
    Icon: Home,
    color: "#64748B",
    view: { page: "dashboard" },
  },
  {
    id: "compliance",
    label: "Compliance & Ética",
    Icon: Shield,
    color: "#3B82F6",
    view: { page: "area", areaId: "compliance" },
  },
  {
    id: "lgpd",
    label: "LGPD & Privacidade",
    Icon: Lock,
    color: "#10B981",
    view: { page: "area", areaId: "lgpd" },
  },
  { id: "inpi", label: "INPI & Marcas", Icon: Stamp, color: "#F59E0B", view: { page: "area", areaId: "inpi" } },
  { id: "societario", label: "Societário", Icon: Scale, color: "#8B5CF6", view: { page: "area", areaId: "societario" } },
  { id: "comercial", label: "Comercial", Icon: Handshake, color: "#EC4899", view: { page: "area", areaId: "comercial" } },
  {
    id: "produtos",
    label: "Produtos & Soluções",
    Icon: Rocket,
    color: "#8B5CF6",
    view: { page: "produtos" },
  },
];

function navActiveId(view) {
  if (view.page === "dashboard") return "dashboard";
  if (view.page === "area" || view.page === "cliente" || view.page === "plano") return view.areaId;
  if (view.page === "produtos" || view.page === "produto") return "produtos";
  return "";
}




function canAccessView(view, allowedModules) {
  if (view.page === "dashboard") return true;
  if (view.page === "area" || view.page === "cliente" || view.page === "plano") {
    return allowedModules.includes(view.areaId);
  }
  if (view.page === "produtos" || view.page === "produto")
    return allowedModules.includes("produtos");
  return true;
}

// ─── App ──────────────────────────────────────────────────────────────────────
import { supabase } from "@/integrations/supabase/client";

const ROW_ID = "main";

const QUADRO_DEFAULTS = {
  modulo: "ambos",
  clientes: [],
  planos: [],
  responsaveis: [],
  status: [],
  prazo: "todos",
};

export default function App() {
  const [data, setDataState] = useState(INIT);
  const [view, setView] = useState({ page: "dashboard" });
  const [loaded, setLoaded] = useState(false);
  const [dashTab, setDashTab] = useState("painel");
  const [quadroFilters, setQuadroFilters] = useState(QUADRO_DEFAULTS);
  const currentUser = useCurrentUser();
  const profiles = useProfiles();
  const currentProfile = currentUser ? profiles.find((p) => p.id === currentUser.id) : null;
  const allowedModules = allowedModulesFor(currentProfile);
  const visibleNav = NAV.filter(
    (item) => item.id === "dashboard" || allowedModules.includes(item.id),
  );
  const activeId = navActiveId(view);

  useDeadlineCheck(data, currentUser);

  useEffect(() => {
    if (!canAccessView(view, allowedModules)) {
      setView({ page: "dashboard" });
      setDashTab("painel");
    }
  }, [view, allowedModules]);

  const remoteRef = useRef(false);
  const saveTimer = useRef(null);
  const dataRef = useRef(data);
  const lastSentJsonRef = useRef("");
  const pendingSaveRef = useRef(false);

  // Wrap setData to also schedule a remote save
  const setData = (updater) => {
    setDataState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      dataRef.current = next;
      return next;
    });
  };

  // Initial load + realtime subscription
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: row } = await supabase
        .from("dashboard_state")
        .select("data")
        .eq("id", ROW_ID)
        .maybeSingle();
      if (!mounted) return;
      if (row?.data) {
        const reconciliado = ensureAreas(row.data);
        setDataState(reconciliado);
        dataRef.current = reconciliado;
        if (reconciliado !== row.data) {
          // quadros novos entraram: persiste para os demais usuarios
          lastSentJsonRef.current = JSON.stringify(reconciliado);
          await supabase
            .from("dashboard_state")
            .update({ data: reconciliado, updated_at: new Date().toISOString() })
            .eq("id", ROW_ID);
        } else {
          remoteRef.current = true;
          lastSentJsonRef.current = JSON.stringify(row.data);
        }
      } else {
        await supabase.from("dashboard_state").insert({ id: ROW_ID, data: INIT });
        dataRef.current = INIT;
        lastSentJsonRef.current = JSON.stringify(INIT);
      }
      setLoaded(true);
    })();

    const channel = supabase
      .channel("dashboard_state_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dashboard_state", filter: `id=eq.${ROW_ID}` },
        (payload) => {
          const newData = payload.new?.data;
          if (!newData) return;
          const newJson = JSON.stringify(newData);
          // Echo of our own write
          if (newJson === lastSentJsonRef.current) return;
          // Same as current local state
          if (newJson === JSON.stringify(dataRef.current)) return;
          // Local edits pending — ignore remote to avoid clobbering
          if (pendingSaveRef.current) return;
          remoteRef.current = true;
          dataRef.current = newData;
          lastSentJsonRef.current = newJson;
          setDataState(newData);
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Debounced save when data changes locally
  useEffect(() => {
    if (!loaded) return;
    if (remoteRef.current) {
      remoteRef.current = false;
      return;
    }
    pendingSaveRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const snapshot = dataRef.current;
      const snapshotJson = JSON.stringify(snapshot);
      lastSentJsonRef.current = snapshotJson;
      await supabase
        .from("dashboard_state")
        .update({ data: snapshot, updated_at: new Date().toISOString() })
        .eq("id", ROW_ID);
      // Only clear pending if no further edits queued meanwhile
      if (JSON.stringify(dataRef.current) === snapshotJson) {
        pendingSaveRef.current = false;
      }
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, loaded]);

  // Deep-link from notifications panel / Quadro Geral
  useEffect(() => {
    function handler(e) {
      const d = e.detail || {};
      const areaId = AREAS.find((a) => a.modulo === d.modulo)?.id || null;
      if (!areaId || !d.cliente) return;
      if (!allowedModules.includes(areaId)) return;
      if (d.plano) setView({ page: "plano", areaId, clienteId: d.cliente, planoId: d.plano });
      else setView({ page: "cliente", areaId, clienteId: d.cliente });
      if (d.item) {
        setTimeout(() => {
          const el = document.getElementById(`item-${d.item}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.style.transition = "box-shadow .3s, background .3s";
            el.style.boxShadow = "0 0 0 3px #0DD3C5";
            el.style.background = "#F0FDFA";
            setTimeout(() => {
              el.style.boxShadow = "";
              el.style.background = "";
            }, 2200);
          }
        }, 350);
      }
    }
    window.addEventListener("adeke:deeplink", handler);
    window.addEventListener("adeke:navigate", handler);
    return () => {
      window.removeEventListener("adeke:deeplink", handler);
      window.removeEventListener("adeke:navigate", handler);
    };
  }, [allowedModules]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Outfit', sans-serif !important; background: #F0F5FF; }
        input, button, textarea, select { font-family: 'Outfit', sans-serif; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 2px; }
        input::placeholder, textarea::placeholder { color: #94A3B8 !important; }
        textarea { font-family: 'Outfit', sans-serif; }
        select option { background: #F8FAFC; color: #0F172A; }
      `}</style>
      <div style={{ display: "flex", minHeight: "100vh", background: "#F0F5FF" }}>
        {/* Sidebar */}
        <aside
          style={{
            width: 220,
            background: "#FFFFFF",
            borderRight: "1px solid #E2E8F0",
            padding: "26px 14px",
            display: "flex",
            flexDirection: "column",
            position: "fixed",
            top: 0,
            bottom: 0,
            left: 0,
            zIndex: 100,
          }}
        >
          <div style={{ paddingLeft: 10, marginBottom: 36 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#0F172A", letterSpacing: -0.5 }}>
              <span style={{ color: "#0DD3C5" }}>A</span>DEKE
            </div>
            <div
              style={{
                color: "#94A3B8",
                fontSize: 10,
                marginTop: 2,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Gestão Estratégica
            </div>
          </div>
          <nav style={{ flex: 1 }}>
            {visibleNav.map(({ id, label, Icon, color, view: v }) => {
              const active = activeId === id;
              const c = color || "#475569";
              return (
                <button
                  key={id}
                  onClick={() => setView(v)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 10,
                    border: "none",
                    background: active ? `${c}18` : "transparent",
                    color: active ? c : "#64748B",
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                    marginBottom: 3,
                    textAlign: "left",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => !active && (e.currentTarget.style.background = "#F1F5F9")}
                  onMouseLeave={(e) =>
                    !active && (e.currentTarget.style.background = "transparent")
                  }
                >
                  <Icon size={15} /> {label}
                </button>
              );
            })}
          </nav>
          <div
            style={{
              borderTop: "1px solid #E2E8F0",
              paddingTop: 14,
              color: "#94A3B8",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            © 2026 ADEKE
          </div>
        </aside>

        {/* Main content */}
        <main style={{ marginLeft: 220, flex: 1, minHeight: "100vh", overflowX: "hidden" }}>
          {view.page === "dashboard" && (
            <div>
              {/* Tab bar */}
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  padding: "16px 44px 0",
                  borderBottom: "1px solid #E2E8F0",
                  background: "#F0F5FF",
                  position: "sticky",
                  top: 0,
                  zIndex: 50,
                }}
              >
                <button
                  onClick={() => setDashTab("painel")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "9px 16px",
                    border: "none",
                    borderBottom:
                      dashTab === "painel" ? "2px solid #0DD3C5" : "2px solid transparent",
                    background: "transparent",
                    color: dashTab === "painel" ? "#0DD3C5" : "#64748B",
                    fontSize: 13,
                    fontWeight: dashTab === "painel" ? 700 : 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                >
                  <Home size={14} /> Painel
                </button>
                <button
                  onClick={() => setDashTab("quadro")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "9px 16px",
                    border: "none",
                    borderBottom:
                      dashTab === "quadro" ? "2px solid #0DD3C5" : "2px solid transparent",
                    background: "transparent",
                    color: dashTab === "quadro" ? "#0DD3C5" : "#64748B",
                    fontSize: 13,
                    fontWeight: dashTab === "quadro" ? 700 : 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                >
                  <LayoutDashboard size={14} /> Quadro Geral
                </button>
                <button
                  onClick={() => setDashTab("relatorios")}
                  style={{
                    display: "flex", alignItems: "center", gap: 7, padding: "9px 16px",
                    border: "none",
                    borderBottom: dashTab === "relatorios" ? "2px solid #0DD3C5" : "2px solid transparent",
                    background: "transparent",
                    color: dashTab === "relatorios" ? "#0DD3C5" : "#64748B",
                    fontSize: 13,
                    fontWeight: dashTab === "relatorios" ? 700 : 500,
                    cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                  }}
                >
                  <BarChart3 size={14} /> Relatórios
                </button>
              </div>
              {dashTab === "painel" && (
                <div style={{ padding: "40px 44px" }}>
                  <Dashboard
                    data={data}
                    setData={setData}
                    nav={setView}
                    allowedModules={allowedModules}
                  />
                </div>
              )}
              {dashTab === "quadro" && (
                <QuadroGeral
                  filters={quadroFilters}
                  setFilters={(next) => setQuadroFilters((prev) => ({ ...prev, ...next }))}
                  allowedModules={allowedModules}
                />
              )}
              {dashTab === "relatorios" && <Relatorios />}
            </div>
          )}
          {view.page !== "dashboard" && (
            <div style={{ padding: "40px 44px" }}>
              {view.page === "area" && allowedModules.includes(view.areaId) && (
                <AreaView areaId={view.areaId} data={data} setData={setData} nav={setView} />
              )}
              {view.page === "cliente" && allowedModules.includes(view.areaId) && (
                <ClienteView
                  areaId={view.areaId}
                  clienteId={view.clienteId}
                  data={data}
                  setData={setData}
                  nav={setView}
                />
              )}
              {view.page === "plano" && allowedModules.includes(view.areaId) && (
                <PlanoView
                  areaId={view.areaId}
                  clienteId={view.clienteId}
                  planoId={view.planoId}
                  data={data}
                  setData={setData}
                  nav={setView}
                />
              )}
              {view.page === "produtos" && allowedModules.includes("produtos") && (
                <ProdutosView data={data} setData={setData} nav={setView} />
              )}
              {view.page === "produto" && allowedModules.includes("produtos") && (
                <ProdutoDetail prodId={view.prodId} data={data} setData={setData} nav={setView} />
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
