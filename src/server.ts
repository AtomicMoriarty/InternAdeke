import "./lib/error-capture";

import { createClient } from "@supabase/supabase-js";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { aplicarAcompanhamentoSemanal } from "./lib/acompanhamentoSemanal";
import type { Area, Cliente, Plano, Item } from "./lib/dashboardTypes";

/** Segredos e bindings que o worker espera encontrar no ambiente. */
type WorkerEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  GRANOLA_WEBHOOK_SECRET?: string;
  GRANOLA_SUPABASE_EMAIL?: string;
  GRANOLA_SUPABASE_PASSWORD?: string;
  [k: string]: unknown;
};

/** Corpo aceito pelo webhook do Granola. */
type CorpoGranola = Record<string, unknown>;

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const RISK_WEBHOOK_QUESTIONS = [
  {
    id: "gov-atas",
    assunto: "Governanca e atas",
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
    area: "RH",
    tipoRisco: "Treinamento",
    importancia: "Media",
    keywords: ["treinamento", "capacitacao", "colaborador", "onboarding", "reciclagem"],
    sugestao: "Criar matriz de treinamentos obrigatorios e evidencias de participacao.",
    planoAcao: "Definir conteudo, periodicidade, publico-alvo e controle de presenca.",
  },
];

function apiJson(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, x-granola-secret",
      ...(init?.headers || {}),
    },
  });
}

function serverUid(prefix = "_") {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`;
}

function plain(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasRiskPlanName(name = "") {
  const value = plain(name);
  return (
    value.includes("risk assessment") || value.includes("risco") || value.includes("assessment")
  );
}

function inferWebhookAnswer(text: string, question: (typeof RISK_WEBHOOK_QUESTIONS)[number]) {
  const source = plain(text);
  if (!question.keywords.some((keyword) => source.includes(plain(keyword)))) return null;
  const negative = ["nao", "sem", "nunca", "falta", "pendente", "informal", "precisa"].some(
    (word) => source.includes(word),
  );
  return negative ? "N" : "P";
}

function rowsFromGranolaTranscript(text: string) {
  const rows = RISK_WEBHOOK_QUESTIONS.flatMap((question) => {
    const atende = inferWebhookAnswer(text, question);
    if (!atende) return [];
    return [
      {
        id: serverUid("risk"),
        sourceId: `granola-${question.id}-${Date.now()}`,
        origem: "Granola",
        assunto: question.assunto,
        atividade: `Transcrição do Granola indicou ponto de avaliação: ${question.assunto}`,
        area: question.area,
        atende,
        tipoRisco: question.tipoRisco,
        sugestao: question.sugestao,
        planoAcao: question.planoAcao,
        importancia: question.importancia,
        status: "Não iniciado",
        evidencia: text.slice(0, 300),
      },
    ];
  });
  if (!rows.length && text.trim()) {
    rows.push({
      id: serverUid("risk"),
      sourceId: `granola-geral-${Date.now()}`,
      origem: "Granola",
      assunto: "Diagnostico geral",
      atividade: "Transcrição recebida do Granola sem tema identificado automaticamente.",
      area: "Compliance",
      atende: "P",
      tipoRisco: "Diagnostico",
      sugestao: "Revisar a transcricao e classificar os pontos relevantes.",
      planoAcao: "Complementar o questionario e transformar pontos relevantes em itens do plano.",
      importancia: "Media",
      status: "Não iniciado",
      evidencia: text.slice(0, 300),
    });
  }
  return rows;
}

function buildRiskItemFromRow(row: Record<string, unknown>, granola: Record<string, unknown>) {
  return {
    id: serverUid("it"),
    name: row.planoAcao || row.sugestao || row.assunto || "Acao de Risk Assessment",
    tipo: row.tipoRisco === "Documentos e Politicas" ? "Documento" : "Processo",
    responsavel: "",
    responsaveis: [],
    status: "Não iniciado",
    kanbanStatus: "Suspenso",
    prazo: "",
    riskAssessmentId: row.id,
    granolaNoteUrl: granola.noteUrl || granola.url || "",
    etiquetas: [
      {
        id: serverUid("tag"),
        nome: row.importancia === "Alta" ? "Alta prioridade" : "Granola",
        cor: row.importancia === "Alta" ? "#EF4444" : "#10B981",
      },
    ],
    obs: [
      "Origem: Granola",
      granola.title ? `Reuniao: ${granola.title}` : "",
      granola.creator ? `Criador: ${granola.creator}` : "",
      `Assunto: ${row.assunto || "-"}`,
      `Area: ${row.area || "-"}`,
      `Risco: ${row.tipoRisco || "-"}`,
      `Atende: ${row.atende || "-"}`,
      `Sugestão: ${row.sugestao || "-"}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

async function handleGranolaRisk(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method === "OPTIONS") return apiJson({ ok: true });
  if (request.method !== "POST") return apiJson({ error: "Use POST" }, { status: 405 });

  const secret = env?.GRANOLA_WEBHOOK_SECRET || process.env.GRANOLA_WEBHOOK_SECRET;
  if (secret && request.headers.get("x-granola-secret") !== secret) {
    return apiJson({ error: "Invalid webhook secret" }, { status: 401 });
  }

  let body: CorpoGranola;
  try {
    body = await request.json();
  } catch {
    return apiJson({ error: "Invalid JSON body" }, { status: 400 });
  }

  const transcript =
    body.transcript || body.Transcript || body.text || body.summary || body.Summary || "";
  const summary = body.summary || body.Summary || "";
  const fullText = [body.title || body.Title, summary, transcript].filter(Boolean).join("\n\n");
  if (!fullText.trim()) return apiJson({ error: "Missing transcript/summary" }, { status: 400 });

  const supabaseUrl = env?.SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = env?.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = env?.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  const integrationEmail = env?.GRANOLA_SUPABASE_EMAIL || process.env.GRANOLA_SUPABASE_EMAIL;
  const integrationPassword =
    env?.GRANOLA_SUPABASE_PASSWORD || process.env.GRANOLA_SUPABASE_PASSWORD;

  const chave = serviceKey || publishableKey;
  if (!supabaseUrl || !chave) {
    return apiJson({ error: "Missing Supabase URL/key for webhook" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!serviceKey && integrationEmail && integrationPassword) {
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: integrationEmail,
      password: integrationPassword,
    });
    if (authError) return apiJson({ error: authError.message }, { status: 401 });
  }

  const { data: row, error } = await supabase
    .from("dashboard_state")
    .select("data")
    .eq("id", "main")
    .maybeSingle();
  if (error) return apiJson({ error: error.message }, { status: 500 });
  const dashboard = row?.data;
  if (!dashboard?.areas) return apiJson({ error: "Dashboard state not found" }, { status: 404 });

  const areaId = body.areaId || body.area_id || "compliance";
  const area = dashboard.areas.find((a: Area) => a.id === areaId);
  if (!area) return apiJson({ error: `Area not found: ${areaId}` }, { status: 404 });

  const requestedClient = plain(
    String(
      body.clienteId || body.cliente_id || body.clientName || body.cliente || body.Title || "",
    ),
  );
  const cliente =
    area.clientes.find((c: Cliente) => c.id === body.clienteId || c.id === body.cliente_id) ||
    area.clientes.find((c: Cliente) => requestedClient && requestedClient.includes(plain(c.name)));
  if (!cliente) {
    return apiJson(
      {
        error: "Client not found",
        hint: "Send clienteId or clientName from Zapier/Granola.",
        availableClients: area.clientes.map((c: Cliente) => ({ id: c.id, name: c.name })),
      },
      { status: 404 },
    );
  }

  const plano =
    cliente.planos.find((p: Plano) => p.id === body.planoId || p.id === body.plano_id) ||
    cliente.planos.find((p: Plano) => hasRiskPlanName(p.name));
  if (!plano)
    return apiJson({ error: "Risk Assessment plan not found for client" }, { status: 404 });

  const granola = {
    title: body.title || body.Title || "",
    creator: body.creator || body.Creator || "",
    attendees: body.attendees || body.Attendees || [],
    noteUrl: body.noteUrl || body.url || body.URL || body["Note URL"] || "",
    receivedAt: new Date().toISOString(),
  };
  const generatedRows = rowsFromGranolaTranscript(fullText);
  const previousRows = plano.riskAssessment?.rows || [];
  const rows = [...previousRows, ...generatedRows];
  const existingItems = new Set(
    (plano.items || []).map((item: Item) => item.riskAssessmentId).filter(Boolean),
  );
  const newItems =
    body.createItems === false
      ? []
      : generatedRows
          .filter(
            (riskRow: Record<string, unknown>) =>
              riskRow.atende !== "S" && !existingItems.has(riskRow.id),
          )
          .map((riskRow: Record<string, unknown>) => buildRiskItemFromRow(riskRow, granola));

  plano.items = [...(plano.items || []), ...newItems];
  plano.riskAssessment = {
    ...(plano.riskAssessment || {}),
    transcript: transcript || plano.riskAssessment?.transcript || "",
    rows,
    granolaMeetings: [...(plano.riskAssessment?.granolaMeetings || []), granola],
    lastGranolaSyncAt: granola.receivedAt,
  };

  const { error: updateError } = await supabase
    .from("dashboard_state")
    .update({ data: dashboard, updated_at: new Date().toISOString() })
    .eq("id", "main");
  if (updateError) return apiJson({ error: updateError.message }, { status: 500 });

  return apiJson({
    ok: true,
    cliente: { id: cliente.id, name: cliente.name },
    plano: { id: plano.id, name: plano.name },
    generatedRows: generatedRows.length,
    createdItems: newItems.length,
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
/**
 * Faz o navegador reconferir o HTML a cada visita.
 *
 * Os arquivos de JS e CSS tem o hash no nome, entao podem ficar cacheados para
 * sempre — trocam de nome quando mudam. O HTML nao: e ele que aponta para o
 * bundle novo. Sem Cache-Control, o navegador aplica cache por heuristica e a
 * pessoa continua vendo a versao antiga depois de publicar, sem ter como
 * desconfiar. Foi o que aconteceu com as abas do Comercial.
 *
 * no-cache nao significa "nao guarde": significa "guarde, mas pergunte antes de
 * usar". Com ETag, a resposta normal e um 304 vazio — barato e sempre certo.
 */
function semCacheNoHtml(response: Response): Response {
  const tipo = response.headers.get("content-type") ?? "";
  if (!tipo.includes("text/html")) return response;
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-cache, must-revalidate");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

/**
 * Acompanhamento semanal: le o estado, acrescenta os comentarios da semana e
 * grava de volta. Roda pelo Cron Trigger, sem depender de alguem com o app
 * aberto. Idempotente — disparar duas vezes na mesma semana nao duplica.
 */
async function rodarAcompanhamentoSemanal(env: WorkerEnv) {
  const supabaseUrl = env?.SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = env?.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, erro: "Faltam SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no worker" };
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error } = await supabase
    .from("dashboard_state")
    .select("data")
    .eq("id", "main")
    .maybeSingle();
  if (error) return { ok: false, erro: error.message };
  if (!row?.data) return { ok: false, erro: "dashboard_state vazio" };

  const r = aplicarAcompanhamentoSemanal(row.data, new Date());
  if (!r.comentariosCriados) {
    return { ok: true, semana: r.semana, criados: 0, visitados: r.itensVisitados };
  }

  const { error: erroGravar } = await supabase
    .from("dashboard_state")
    .update({ data: r.data, updated_at: new Date().toISOString() })
    .eq("id", "main");
  if (erroGravar) return { ok: false, erro: erroGravar.message };

  return { ok: true, semana: r.semana, criados: r.comentariosCriados, visitados: r.itensVisitados };
}

export default {
  async scheduled(_event: unknown, env: WorkerEnv) {
    const r = await rodarAcompanhamentoSemanal(env);
    console.log("[acompanhamento semanal]", JSON.stringify(r));
  },

  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/granola-risk") {
        return await handleGranolaRisk(request, env as WorkerEnv);
      }
      // Disparo manual, para conferir sem esperar a segunda-feira. Protegido
      // pelo mesmo segredo do webhook do Granola.
      if (url.pathname === "/api/acompanhamento-semanal") {
        const segredo =
          (env as WorkerEnv)?.GRANOLA_WEBHOOK_SECRET || process.env.GRANOLA_WEBHOOK_SECRET;
        const enviado = url.searchParams.get("secret") || request.headers.get("x-webhook-secret");
        if (!segredo || enviado !== segredo) {
          return apiJson({ error: "Nao autorizado" }, { status: 401 });
        }
        return apiJson(await rodarAcompanhamentoSemanal(env as WorkerEnv));
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return semCacheNoHtml(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
