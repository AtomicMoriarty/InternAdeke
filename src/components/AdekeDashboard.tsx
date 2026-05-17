// @ts-nocheck
import { useState, useRef, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  Shield, Lock, Rocket, Home, CheckCircle, Clock, AlertCircle,
  PauseCircle, MinusCircle, Plus, ArrowLeft, Activity, ChevronRight,
  TrendingUp, Trash2, User, Building2, FolderOpen, StickyNote, Info, X, Edit3,
  ArrowUp, ArrowDown, MessageSquare
} from "lucide-react";
import ResponsaveisPicker from "@/components/ResponsaveisPicker";
import MentionTextarea, { MentionText, extractMentions } from "@/components/MentionTextarea";
import { useProfiles, initials, colorFor } from "@/lib/profiles";
import { emitNotifications, emitAtribuicao, emitMudancaStatus } from "@/lib/notifications";
import { useCurrentUser } from "@/lib/useCurrentUser";

function moduloOf(areaId) {
  if (areaId === "lgpd") return "LGPD";
  if (areaId === "compliance") return "Compliance";
  return "Produtos";
}
function ResponsaveisAvatars({ ids }) {
  const profiles = useProfiles();
  const sel = (ids || []).map((id) => profiles.find((p) => p.id === id)).filter(Boolean);
  if (!sel.length) return <span style={{ color: "#94A3B8", fontSize: 11 }}>—</span>;
  return (
    <span style={{ display: "inline-flex" }}>
      {sel.slice(0, 4).map((p, i) => (
        <span key={p.id} title={p.display_name} style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 22, height: 22, borderRadius: "50%", background: p.avatar_color || colorFor(p.id),
          color: "#fff", fontSize: 9, fontWeight: 800, marginLeft: i === 0 ? 0 : -6, border: "1.5px solid #fff",
        }}>{initials(p.display_name)}</span>
      ))}
      {sel.length > 4 && (
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 22, height: 22, borderRadius: "50%", background: "#64748B",
          color: "#fff", fontSize: 9, fontWeight: 800, marginLeft: -6, border: "1.5px solid #fff",
        }}>+{sel.length - 4}</span>
      )}
    </span>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_META = {
  "Concluído":    { color: "#10B981", bg: "#ECFDF5", icon: CheckCircle },
  "Em andamento": { color: "#3B82F6", bg: "#EFF6FF", icon: Clock },
  "Planejamento": { color: "#F59E0B", bg: "#FFFBEB", icon: AlertCircle },
  "Pausado":      { color: "#F97316", bg: "#FFF7ED", icon: PauseCircle },
  "Não iniciado": { color: "#64748B", bg: "#F8FAFC", icon: MinusCircle },
};
const STATUS_ORDER = ["Concluído", "Em andamento", "Planejamento", "Pausado", "Não iniciado"];
const TIPOS_ITEM = ["Organograma", "Política", "Procedimento", "Processo", "Treinamento", "Relatório", "Auditoria", "Documento", "Outro"];

function uid() { return `_${Math.random().toString(36).slice(2, 9)}`; }

// ─── Initial Data ─────────────────────────────────────────────────────────────
const INIT = {
  areas: [
    {
      id: "compliance", name: "Compliance & Ética", color: "#0DD3C5",
      responsavel: "",
      clientes: [],
    },
    {
      id: "lgpd", name: "LGPD & Privacidade", color: "#06C8D9",
      responsavel: "", dpo: "",
      clientes: [],
    },
  ],
  produtos: [
    {
      id: "financeiro", name: "Produto Financeiro", emoji: "📊", color: "#8B5CF6",
      responsavel: "", descricao: "Solução financeira em elaboração",
      items: [
        { id:"f1", name:"Definição de escopo e MVP", status:"Em andamento", prazo:"", obs:"" },
        { id:"f2", name:"Análise de mercado e benchmarking", status:"Planejamento", prazo:"", obs:"" },
        { id:"f3", name:"Desenvolvimento da solução", status:"Não iniciado", prazo:"", obs:"" },
        { id:"f4", name:"Testes e validação", status:"Não iniciado", prazo:"", obs:"" },
        { id:"f5", name:"Homologação regulatória", status:"Não iniciado", prazo:"", obs:"" },
        { id:"f6", name:"Go-to-market e lançamento", status:"Não iniciado", prazo:"", obs:"" },
        { id:"f7", name:"Pós-venda e suporte", status:"Não iniciado", prazo:"", obs:"" },
        { id:"f8", name:"Métricas e KPIs de desempenho", status:"Não iniciado", prazo:"", obs:"" },
      ],
      notas: [], informacoes: [],
    },
    {
      id: "proposta", name: "Proposta", emoji: "📄", color: "#06B6D4",
      responsavel: "", descricao: "Produto de gestão de propostas comerciais",
      items: [
        { id:"p1", name:"Definição de escopo e MVP", status:"Em andamento", prazo:"", obs:"" },
        { id:"p2", name:"Modelagem do produto", status:"Planejamento", prazo:"", obs:"" },
        { id:"p3", name:"Desenvolvimento", status:"Não iniciado", prazo:"", obs:"" },
        { id:"p4", name:"Testes e validação", status:"Não iniciado", prazo:"", obs:"" },
        { id:"p5", name:"Piloto com clientes selecionados", status:"Não iniciado", prazo:"", obs:"" },
        { id:"p6", name:"Lançamento comercial", status:"Não iniciado", prazo:"", obs:"" },
        { id:"p7", name:"Métricas e KPIs", status:"Não iniciado", prazo:"", obs:"" },
        { id:"p8", name:"Evoluções pós-lançamento", status:"Não iniciado", prazo:"", obs:"" },
      ],
      notas: [], informacoes: [],
    },
    {
      id: "contractia", name: "Contract.IA", emoji: "📑", color: "#10B981",
      responsavel: "", descricao: "Gestão inteligente da vida útil de contratos",
      items: [
        { id:"ci1", name:"Mapeamento da vida útil do contrato", status:"Em andamento", prazo:"", obs:"" },
        { id:"ci2", name:"Definição de funcionalidades core", status:"Em andamento", prazo:"", obs:"" },
        { id:"ci3", name:"Arquitetura e tecnologia de IA", status:"Planejamento", prazo:"", obs:"" },
        { id:"ci4", name:"Módulo de criação de contratos", status:"Planejamento", prazo:"", obs:"" },
        { id:"ci5", name:"Módulo de gestão e alertas", status:"Não iniciado", prazo:"", obs:"" },
        { id:"ci6", name:"Módulo de renovação e encerramento", status:"Não iniciado", prazo:"", obs:"" },
        { id:"ci7", name:"Integrações com sistemas externos", status:"Não iniciado", prazo:"", obs:"" },
        { id:"ci8", name:"Testes, homologação e lançamento", status:"Não iniciado", prazo:"", obs:"" },
      ],
      notas: [], informacoes: [],
    },
    {
      id: "crivo", name: "Crivo", emoji: "🔍", color: "#F59E0B",
      responsavel: "", descricao: "Análise de fornecedores e Reforma Tributária",
      items: [
        { id:"cr1", name:"Mapeamento do processo de fornecedores", status:"Planejamento", prazo:"", obs:"" },
        { id:"cr2", name:"Análise de impacto da Reforma Tributária", status:"Planejamento", prazo:"", obs:"" },
        { id:"cr3", name:"Definição de critérios de avaliação", status:"Planejamento", prazo:"", obs:"" },
        { id:"cr4", name:"Desenvolvimento do motor de análise", status:"Não iniciado", prazo:"", obs:"" },
        { id:"cr5", name:"Integração com bases externas", status:"Não iniciado", prazo:"", obs:"" },
        { id:"cr6", name:"Módulo de relatórios e dashboards", status:"Não iniciado", prazo:"", obs:"" },
        { id:"cr7", name:"Piloto com empresas parceiras", status:"Não iniciado", prazo:"", obs:"" },
        { id:"cr8", name:"Lançamento e roadmap de evoluções", status:"Não iniciado", prazo:"", obs:"" },
      ],
      notas: [], informacoes: [],
    },
    {
      id: "canal-etica", name: "Canal de Ética", emoji: "🛡️", color: "#EC4899",
      responsavel: "", descricao: "Canal confidencial de denúncias e ética corporativa",
      isCanalEtica: true,
      items: [
        { id:"ce1", name:"Definição de escopo e canais de recebimento", status:"Não iniciado", prazo:"", obs:"" },
        { id:"ce2", name:"Política do canal e código de conduta", status:"Não iniciado", prazo:"", obs:"" },
        { id:"ce3", name:"Desenvolvimento da plataforma/tecnologia", status:"Não iniciado", prazo:"", obs:"" },
        { id:"ce4", name:"Treinamento e comunicação interna", status:"Não iniciado", prazo:"", obs:"" },
        { id:"ce5", name:"Piloto e homologação", status:"Não iniciado", prazo:"", obs:"" },
        { id:"ce6", name:"Lançamento e operação contínua", status:"Não iniciado", prazo:"", obs:"" },
      ],
      notas: [], informacoes: [],
    },
  ],
  updates: [
    { id: "u0", date: "11/05/2026", area: "Geral", texto: "Plataforma de gestão Adeke iniciada.", autor: "Equipe Adeke" },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function prog(items) {
  const total = items.length, done = items.filter(i => i.status === "Concluído").length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}
function areaProg(area) {
  const items = area.clientes.flatMap(c => c.planos.flatMap(p => p.items));
  return prog(items);
}

// ─── Templates por área ──────────────────────────────────────────────────────
const TEMPLATES = {
  lgpd: [
    { name: "Dados da empresa", items: ["Contato", "Dados da empresa", "Dados de prestadores de serviços"] },
    { name: "Atas de Reuniões", items: [] },
    { name: "Reuniões Semanais do P&P", items: [] },
    { name: "Mobilização Inicial", items: ["Kickoff do Programa", "Definição DPO", "Treinamento Inicial", "Comitê de Proteção de Dados", "Política de Privacidade e Proteção de Dados Inicial", "Revisão do Site", "Organograma"] },
    { name: "Mapeamento e Classificação", items: ["Análise de Gaps e Recomendações", "Fluxo de Tratamento de Dados", "Planilha de Mapeamento", "Mapeamento de Riscos"] },
    { name: "Terceiros (Operadores)", items: ["TO DO", "Empresa de Contabilidade"] },
    { name: "Documentos Jurídicos", items: ["Política de Privacidade Final", "Contrato de Trabalho – Auxiliar Administrativo", "Contrato de Trabalho – Advogados", "Política Interna", "Termos de Consentimento", "Disclaimer de E-mails Corporativos", "Contrato de Honorários", "Termo de Compromisso de Estágio"] },
    { name: "Governança", items: ["Gerenciamento de Incidentes", "Gerenciamento de Solicitação de Titulares", "Relatório de Impacto", "Treinamento Final", "Relatório Final"] },
  ],
  compliance: [
    { name: "Dados da empresa", items: ["Contato", "Dados da empresa"] },
    { name: "Atas de Reuniões Externas", items: [] },
    { name: "Atas de Reuniões Internas", items: [] },
    { name: "Risk Assessment", items: ["Mapeamento das Atividades", "Classificação de Risco", "Sugestão de Melhorias"] },
    { name: "Código de Conduta", items: ["Código de Conduta"] },
    { name: "Políticas", items: ["Política Anticorrupção", "Política de Brindes, Presentes e Hospitalidades", "Política de Conflito de Interesses", "Política de Doações e Patrocínios", "Política de Due Diligence de Terceiros", "Política de Compliance Concorrencial", "Política de Prevenção à Lavagem de Dinheiro", "Política de Consequências"] },
    { name: "Documentos e Termos", items: ["Termo de Confidencialidade", "Termo de Imagem e Voz", "Termo de Comodato Equipamentos", "Termo de Comodato Veículos", "Termo de Uso – Website"] },
    { name: "Canais", items: ["Canal de Ética", "Ouvidoria"] },
    { name: "Treinamento", items: ["Treinamento", "Emissão de Certificado"] },
    { name: "Revisão Final", items: ["Repasse Programa de Integridade", "Auditoria", "Relatório de Monitoramento", "Revisão Final do Programa"] },
  ],
};
function buildTemplatePlanos(areaId) {
  const t = TEMPLATES[areaId] || [];
  return t.map(p => ({
    id: `pl${uid()}`, name: p.name, responsavel: "", notas: [],
    items: p.items.map(n => ({
      id: `it${uid()}`, name: n, tipo: "Documento", responsavel: "",
      status: "Não iniciado", obs: "", prazo: "",
    })),
  }));
}

// Stable: completed go to the end, preserving order within each group
function sortItemsByCompletion(items) {
  const open = items.filter(i => i.status !== "Concluído");
  const done = items.filter(i => i.status === "Concluído");
  return [...open, ...done];
}
function planoIsDone(p) {
  return p.items.length > 0 && p.items.every(i => i.status === "Concluído");
}
function sortPlanosByCompletion(planos) {
  const open = planos.filter(p => !planoIsDone(p));
  const done = planos.filter(p => planoIsDone(p));
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
  const from = arr.findIndex(x => x.id === sourceId);
  const to = arr.findIndex(x => x.id === targetId);
  if (from < 0 || to < 0) return arr;
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
function todayBR() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
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
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.9s ease" }} />
    </svg>
  );
}

function Bar2({ pct, color }) {
  return (
    <div style={{ background: "#E2E8F0", borderRadius: 4, height: 6 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.7s ease" }} />
    </div>
  );
}

function StatusPill({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const m = STATUS_META[status] || STATUS_META["Não iniciado"];
  const Icon = m.icon;
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: "flex", alignItems: "center", gap: 7, padding: "6px 14px",
        borderRadius: 20, border: `1.5px solid ${m.color}50`, background: m.bg,
        color: m.color, cursor: "pointer", fontSize: 12, fontWeight: 700,
        fontFamily: "inherit", whiteSpace: "nowrap", boxShadow: `0 1px 4px ${m.color}20`
      }}>
        <Icon size={13} /> {status}
      </button>
      {open && (
        <div onClick={e => e.stopPropagation()} style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 999,
          background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12,
          overflow: "hidden", minWidth: 165, boxShadow: "0 8px 30px rgba(0,0,0,0.12)"
        }}>
          {STATUS_ORDER.map(s => {
            const sm = STATUS_META[s]; const SI = sm.icon;
            return (
              <button key={s} onClick={() => { onChange(s); setOpen(false); }} style={{
                display: "flex", alignItems: "center", gap: 9, padding: "10px 16px",
                width: "100%", background: s === status ? sm.bg : "transparent",
                color: sm.color, border: "none", cursor: "pointer", fontSize: 12,
                fontWeight: 600, fontFamily: "inherit", textAlign: "left",
                transition: "background 0.1s"
              }}>
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
  background: "#F8FAFC", border: "1px solid #CBD5E1", borderRadius: 8,
  padding: "8px 12px", color: "#0F172A", fontSize: 12, fontFamily: "inherit",
  outline: "none",
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ data, setData, nav }) {
  const [upd, setUpd] = useState("");
  const [autor, setAutor] = useState("");

  const allItems = [
    ...data.areas.flatMap(a => a.clientes.flatMap(c => c.planos.flatMap(p => p.items))),
    ...data.produtos.flatMap(p => p.items),
  ];
  const total = allItems.length;
  const done  = allItems.filter(i => i.status === "Concluído").length;
  const inp2  = allItems.filter(i => i.status === "Em andamento").length;

  const chartData = STATUS_ORDER.map(s => ({
    name: s === "Não iniciado" ? "Não inic." : s === "Em andamento" ? "Em and." : s === "Planejamento" ? "Plan." : s,
    v: allItems.filter(i => i.status === s).length,
    color: STATUS_META[s].color,
  }));

  function addUpd() {
    if (!upd.trim()) return;
    setData(d => ({ ...d, updates: [{ id: `u${Date.now()}`, date: new Date().toLocaleDateString("pt-BR"), area: "Geral", texto: upd, autor: autor || "Equipe" }, ...d.updates] }));
    setUpd(""); setAutor("");
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <p style={{ color: "#64748B", fontSize: 12, marginBottom: 4 }}>
          {new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0F172A", letterSpacing: -0.5 }}>
          Painel <span style={{ color: "#0DD3C5" }}>Adeke</span>
        </h1>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Iniciativas totais", val: total, color: "#3B82F6", Icon: Activity },
          { label: "Concluídas",         val: done,  color: "#10B981", Icon: CheckCircle },
          { label: "Em andamento",       val: inp2,  color: "#F59E0B", Icon: TrendingUp },
        ].map(({ label, val, color, Icon }) => (
          <div key={label} style={{ background: "#FFFFFF", border: "1px solid #1e2d45", borderRadius: 14, padding: "20px 22px", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
        {data.areas.map(area => {
          const { total: t, done: d, pct } = areaProg(area);
          const AIcon = area.id === "compliance" ? Shield : Lock;
          return (
            <button key={area.id} onClick={() => nav({ page: "area", areaId: area.id })} style={{
              background: "#FFFFFF", border: `1px solid ${area.color}28`,
              borderRadius: 14, padding: 22, cursor: "pointer", textAlign: "left",
              transition: "border-color 0.15s, background 0.15s"
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `${area.color}60`; e.currentTarget.style.background = `${area.color}08`; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = `${area.color}28`; e.currentTarget.style.background = "#FFFFFF"; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, marginRight: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
                    <div style={{ background: `${area.color}18`, borderRadius: 8, padding: "6px 8px", display: "flex" }}>
                      <AIcon size={15} color={area.color} />
                    </div>
                    <span style={{ color: area.color, fontSize: 12, fontWeight: 700 }}>{area.name}</span>
                  </div>
                  <p style={{ color: "#0F172A", fontSize: 20, fontWeight: 900, marginBottom: 2 }}>{d}/{t}</p>
                  <p style={{ color: "#64748B", fontSize: 11, marginBottom: 14 }}>
                    {area.clientes.length} cliente{area.clientes.length !== 1 ? "s" : ""} · iniciativas concluídas
                  </p>
                  <Bar2 pct={pct} color={area.color} />
                </div>
                <div style={{ position: "relative", width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ring pct={pct} color={area.color} size={80} />
                  <span style={{ position: "absolute", color: "#0F172A", fontSize: 14, fontWeight: 800 }}>{pct}%</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, color: area.color, fontSize: 11, fontWeight: 700, marginTop: 14, justifyContent: "flex-end" }}>
                Ver clientes <ChevronRight size={13} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Produtos strip */}
      <button onClick={() => nav({ page: "produtos" })} style={{
        width: "100%", background: "#FFFFFF", border: "1px solid #8B5CF628",
        borderRadius: 14, padding: 20, cursor: "pointer", textAlign: "left",
        marginBottom: 20, transition: "border-color 0.15s, background 0.15s"
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "#8B5CF660"; e.currentTarget.style.background = "#8B5CF60a"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "#8B5CF628"; e.currentTarget.style.background = "#FFFFFF"; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 16 }}>
          <div style={{ background: "#8B5CF618", borderRadius: 8, padding: "6px 8px", display: "flex" }}>
            <Rocket size={15} color="#8B5CF6" />
          </div>
          <span style={{ color: "#8B5CF6", fontSize: 12, fontWeight: 700 }}>Produtos & Soluções</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, color: "#8B5CF6", fontSize: 11, fontWeight: 700 }}>
            Ver todos <ChevronRight size={13} />
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {data.produtos.map(p => {
            const { total: t, done: d, pct } = prog(p.items);
            return (
              <div key={p.id} style={{ background: `${p.color}0f`, border: `1px solid ${p.color}28`, borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{p.emoji}</div>
                <div style={{ color: "#0F172A", fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{p.name}</div>
                <div style={{ color: p.color, fontSize: 10, fontWeight: 600, marginBottom: 8 }}>{d}/{t} etapas</div>
                <Bar2 pct={pct} color={p.color} />
              </div>
            );
          })}
        </div>
      </button>

      {/* Chart + Activity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: "#FFFFFF", border: "1px solid #1e2d45", borderRadius: 14, padding: 22 }}>
          <p style={{ color: "#64748B", fontSize: 12, fontWeight: 700, marginBottom: 18, letterSpacing: 0.5, textTransform: "uppercase" }}>Distribuição por status</p>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={chartData} barSize={22} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#F8FAFC", border: "1px solid #2a3550", borderRadius: 8, color: "#0F172A", fontSize: 11 }} cursor={{ fill: "#ffffff06" }} />
              <Bar dataKey="v" radius={[5, 5, 0, 0]}>
                {chartData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #1e2d45", borderRadius: 14, padding: 22, display: "flex", flexDirection: "column" }}>
          <p style={{ color: "#64748B", fontSize: 12, fontWeight: 700, marginBottom: 14, letterSpacing: 0.5, textTransform: "uppercase" }}>Atualizações recentes</p>
          <div style={{ flex: 1, overflowY: "auto", maxHeight: 120, marginBottom: 14 }}>
            {data.updates.slice(0, 6).map(u => (
              <div key={u.id} style={{ paddingLeft: 12, borderLeft: "2px solid #0DD3C5", marginBottom: 12 }}>
                <p style={{ color: "#1E293B", fontSize: 12, fontWeight: 500, marginBottom: 2 }}>{u.texto}</p>
                <p style={{ color: "#64748B", fontSize: 10 }}>{u.autor} · {u.date}</p>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={upd} onChange={e => setUpd(e.target.value)} onKeyDown={e => e.key === "Enter" && addUpd()}
              placeholder="Registrar atualização..." style={{ ...inp, flex: 1 }} />
            <button onClick={addUpd} style={{
              background: "#0DD3C5", border: "none", borderRadius: 8, padding: "8px 12px",
              color: "#fff", cursor: "pointer", display: "flex", alignItems: "center"
            }}><Plus size={15} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Area View (Client List) ───────────────────────────────────────────────────
function AreaView({ areaId, data, setData, nav }) {
  const area = data.areas.find(a => a.id === areaId);
  const [newName, setNewName] = useState("");
  const AIcon = areaId === "compliance" ? Shield : Lock;

  const { total, done, pct } = areaProg(area);

  function addCliente() {
    if (!newName.trim()) return;
    const cliente = { id: `cli${uid()}`, name: newName.trim(), planos: buildTemplatePlanos(areaId), canalEtica: false };
    setData(d => ({ ...d, areas: d.areas.map(a => a.id !== areaId ? a : { ...a, clientes: [...a.clientes, cliente] }) }));
    setNewName("");
  }
  function removeCliente(cId) {
    if (!confirm("Remover este cliente e todos os seus planos?")) return;
    setData(d => ({ ...d, areas: d.areas.map(a => a.id !== areaId ? a : { ...a, clientes: a.clientes.filter(c => c.id !== cId) }) }));
  }
  function toggleCanalEtica(cId) {
    setData(d => ({ ...d, areas: d.areas.map(a => a.id !== areaId ? a : {
      ...a, clientes: a.clientes.map(c => c.id !== cId ? c : { ...c, canalEtica: !c.canalEtica })
    })}));
  }
  function setResp(val) {
    setData(d => ({ ...d, areas: d.areas.map(a => a.id !== areaId ? a : { ...a, responsavel: val }) }));
  }
  function setDpo(val) {
    setData(d => ({ ...d, areas: d.areas.map(a => a.id !== areaId ? a : { ...a, dpo: val }) }));
  }

  return (
    <div>
      <button onClick={() => nav({ page: "dashboard" })} style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748B", background: "none", border: "none", cursor: "pointer", fontSize: 13, marginBottom: 22, fontFamily: "inherit" }}>
        <ArrowLeft size={15} /> Voltar ao Painel
      </button>

      {/* Header */}
      <div style={{ background: "#FFFFFF", border: `1px solid ${area.color}30`, borderRadius: 16, padding: 26, marginBottom: 24 }}>
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
                  onChange={(ids) => setData(d => ({ ...d, areas: d.areas.map(a => a.id !== areaId ? a : { ...a, responsaveis: ids }) }))}
                />
              </label>
              {areaId === "lgpd" && (
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Shield size={13} color="#475569" />
                  <span style={{ color: "#64748B", fontSize: 12 }}>DPO:</span>
                  <input value={area.dpo || ""} onChange={e => setDpo(e.target.value)}
                    placeholder="Nome do DPO..."
                    style={{ ...inp, width: 180 }} />
                </label>
              )}
            </div>
          </div>
          <div style={{ position: "relative", width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ring pct={pct} color={area.color} size={100} stroke={9} />
            <div style={{ position: "absolute", textAlign: "center" }}>
              <p style={{ color: "#0F172A", fontSize: 18, fontWeight: 900 }}>{pct}%</p>
              <p style={{ color: "#64748B", fontSize: 10 }}>{done}/{total}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add client */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addCliente()}
          placeholder="Nome do cliente..."
          style={{ ...inp, flex: 1, fontSize: 13, padding: "9px 14px" }} />
        <button onClick={addCliente} style={{
          background: area.color, border: "none", borderRadius: 8, padding: "9px 16px",
          color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          fontSize: 13, fontWeight: 700, fontFamily: "inherit"
        }}>
          <Plus size={15} /> Adicionar Cliente
        </button>
      </div>

      {/* Client grid */}
      {area.clientes.length === 0 ? (
        <div style={{ background: "#FFFFFF", border: "1px dashed #1e2d45", borderRadius: 16, padding: 48, textAlign: "center" }}>
          <Building2 size={28} color="#E2E8F0" style={{ margin: "0 auto 12px" }} />
          <p style={{ color: "#94A3B8", fontSize: 14, fontWeight: 600 }}>Nenhum cliente cadastrado</p>
          <p style={{ color: "#E2E8F0", fontSize: 12, marginTop: 4 }}>Adicione o primeiro cliente acima para começar</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {area.clientes.map(cliente => {
            const cItems = cliente.planos.flatMap(p => p.items);
            const { total: ct, done: cd, pct: cp } = prog(cItems);
            return (
              <div key={cliente.id} style={{
                background: "#FFFFFF", border: `1px solid ${area.color}28`,
                borderRadius: 16, padding: 22,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <div style={{ background: `${area.color}18`, borderRadius: 8, padding: "5px 6px", display: "flex" }}>
                        <Building2 size={14} color={area.color} />
                      </div>
                      <span style={{ color: "#0F172A", fontSize: 15, fontWeight: 800 }}>{cliente.name}</span>
                    </div>
                    <p style={{ color: "#64748B", fontSize: 11, marginBottom: 12 }}>
                      {cliente.planos.length} plano{cliente.planos.length !== 1 ? "s" : ""} · {ct} item{ct !== 1 ? "s" : ""}
                    </p>
                    <Bar2 pct={cp} color={area.color} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 14 }}>
                    <div style={{ position: "relative", width: 54, height: 54, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Ring pct={cp} color={area.color} size={54} stroke={5} />
                      <span style={{ position: "absolute", color: "#0F172A", fontSize: 11, fontWeight: 800 }}>{cp}%</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => nav({ page: "cliente", areaId, clienteId: cliente.id })} style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    background: `${area.color}18`, border: `1px solid ${area.color}30`, borderRadius: 8,
                    color: area.color, fontSize: 12, fontWeight: 700, padding: "7px 0",
                    cursor: "pointer", fontFamily: "inherit"
                  }}>
                    <FolderOpen size={13} /> Ver Planos <ChevronRight size={12} />
                  </button>
                  <button onClick={() => toggleCanalEtica(cliente.id)} title="Ativar/desativar Canal de Ética para este cliente" style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "7px 12px", borderRadius: 8,
                    background: cliente.canalEtica ? "#FDF2F8" : "#F8FAFC",
                    border: `1px solid ${cliente.canalEtica ? "#EC489950" : "#E2E8F0"}`,
                    color: cliente.canalEtica ? "#EC4899" : "#94A3B8",
                    fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    whiteSpace: "nowrap"
                  }}>
                    🛡️ {cliente.canalEtica ? "Canal ✓" : "Canal"}
                  </button>
                  <button onClick={() => removeCliente(cliente.id)} style={{
                    background: "#ef444415", border: "1px solid #ef444430", borderRadius: 8,
                    color: "#ef4444", padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center"
                  }}>
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
  const area = data.areas.find(a => a.id === areaId);
  const cliente = area.clientes.find(c => c.id === clienteId);
  const [newPlanoName, setNewPlanoName] = useState("");
  const [openNotasId, setOpenNotasId] = useState(null);
  const [notaDraft, setNotaDraft] = useState({});
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const me = useCurrentUser();
  const profiles = useProfiles();

  function reorderPlanos(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    updatePlanos(planos => reorderById(planos, sourceId, targetId));
  }

  if (!cliente) return null;

  function updatePlanos(updater) {
    setData(d => ({ ...d, areas: d.areas.map(a => a.id !== areaId ? a : {
      ...a, clientes: a.clientes.map(c => c.id !== clienteId ? c : { ...c, planos: updater(c.planos) })
    })}));
  }

  function addPlano() {
    if (!newPlanoName.trim()) return;
    const plano = { id: `pl${uid()}`, name: newPlanoName.trim(), responsavel: "", responsaveis: [], notas: [], items: [] };
    updatePlanos(planos => sortPlanosByCompletion([...planos, plano]));
    setNewPlanoName("");
  }
  function removePlano(planoId) {
    if (!confirm("Remover este plano e todos os seus itens?")) return;
    updatePlanos(planos => planos.filter(p => p.id !== planoId));
  }
  function setPlanoResponsaveis(planoId, ids) {
    updatePlanos(planos => planos.map(p => p.id !== planoId ? p : { ...p, responsaveis: ids }));
  }
  function movePlano(planoId, dir) {
    updatePlanos(planos => {
      const idx = planos.findIndex(p => p.id === planoId);
      if (idx < 0) return planos;
      return moveInArray(planos, idx, dir);
    });
  }
  function addNota(plano) {
    const txt = (notaDraft[plano.id] || "").trim();
    if (!txt) return;
    const meName = profiles.find(p => p.id === me?.id)?.display_name || "Usuário";
    const entry = { id: `n${uid()}`, date: todayBR(), text: txt, autor_id: me?.id || null, autor_nome: meName };
    updatePlanos(planos => planos.map(p => p.id !== plano.id ? p : { ...p, notas: [...(p.notas || []), entry] }));
    setNotaDraft(d => ({ ...d, [plano.id]: "" }));
    // Emit notifications
    if (me) {
      const mentioned = extractMentions(txt, profiles).map(p => p.id);
      const resp = [...(plano.responsaveis || []), ...(cliente.responsaveis || [])];
      emitNotifications({
        ctx: {
          cliente_id: cliente.id, cliente_nome: cliente.name,
          modulo: moduloOf(areaId),
          plano_id: plano.id, plano_nome: plano.name,
          autor_id: me.id, autor_nome: meName, trecho: txt,
        },
        mentionedIds: mentioned,
        responsibleIds: resp,
      });
    }
  }
  function removeNota(planoId, notaId) {
    updatePlanos(planos => planos.map(p => p.id !== planoId ? p : { ...p, notas: (p.notas || []).filter(n => n.id !== notaId) }));
  }

  const totalGeral = cliente.planos.flatMap(p => p.items);
  const { pct: pctGeral } = prog(totalGeral);

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 22 }}>
        <button onClick={() => nav({ page: "dashboard" })} style={{ color: "#94A3B8", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Painel</button>
        <ChevronRight size={13} color="#334155" />
        <button onClick={() => nav({ page: "area", areaId })} style={{ color: "#94A3B8", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>{area.name}</button>
        <ChevronRight size={13} color="#334155" />
        <span style={{ color: "#64748B", fontSize: 12, fontWeight: 600 }}>{cliente.name}</span>
      </div>

      {/* Header */}
      <div style={{ background: "#FFFFFF", border: `1px solid ${area.color}30`, borderRadius: 16, padding: 26, marginBottom: 24 }}>
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
              {cliente.planos.length} plano{cliente.planos.length !== 1 ? "s" : ""} cadastrado{cliente.planos.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div style={{ position: "relative", width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Ring pct={pctGeral} color={area.color} size={100} stroke={9} />
            <div style={{ position: "absolute", textAlign: "center" }}>
              <p style={{ color: "#0F172A", fontSize: 18, fontWeight: 900 }}>{pctGeral}%</p>
              <p style={{ color: "#64748B", fontSize: 10 }}>geral</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add plan */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input value={newPlanoName} onChange={e => setNewPlanoName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addPlano()}
          placeholder="Nome do plano (ex: Plano de Integridade)..."
          style={{ ...inp, flex: 1, fontSize: 13, padding: "9px 14px" }} />
        <button onClick={addPlano} style={{
          background: area.color, border: "none", borderRadius: 8, padding: "9px 16px",
          color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          fontSize: 13, fontWeight: 700, fontFamily: "inherit"
        }}>
          <Plus size={15} /> Novo Plano
        </button>
      </div>

      {/* Plans */}
      {cliente.planos.length === 0 ? (
        <div style={{ background: "#FFFFFF", border: "1px dashed #1e2d45", borderRadius: 16, padding: 48, textAlign: "center" }}>
          <FolderOpen size={28} color="#E2E8F0" style={{ margin: "0 auto 12px" }} />
          <p style={{ color: "#94A3B8", fontSize: 14, fontWeight: 600 }}>Nenhum plano criado</p>
          <p style={{ color: "#E2E8F0", fontSize: 12, marginTop: 4 }}>Crie o primeiro plano para este cliente</p>
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
              <div key={plano.id}
                draggable
                onDragStart={(e) => { setDragId(plano.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragOverId !== plano.id) setDragOverId(plano.id); }}
                onDragLeave={() => { if (dragOverId === plano.id) setDragOverId(null); }}
                onDrop={(e) => { e.preventDefault(); reorderPlanos(dragId, plano.id); setDragId(null); setDragOverId(null); }}
                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                style={{
                  background: "#FFFFFF",
                  border: `${isDragOver ? 2 : 1}px ${isDragOver ? "dashed" : "solid"} ${isDragOver ? area.color : (isDone ? "#10B98140" : area.color + "20")}`,
                  borderRadius: 16, padding: 22,
                  opacity: isDragging ? 0.5 : (isDone ? 0.85 : 1),
                  cursor: "grab", transition: "border-color 0.15s, opacity 0.15s",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, marginRight: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span title="Arraste para reordenar" style={{ color: "#94A3B8", fontSize: 14, cursor: "grab", userSelect: "none" }}>⋮⋮</span>
                      <FolderOpen size={16} color={area.color} />
                      <span style={{ color: "#0F172A", fontSize: 16, fontWeight: 800 }}>{plano.name}</span>
                      {isDone && <span style={{ background: "#ECFDF5", color: "#10B981", border: "1px solid #10B98140", borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 700 }}>✓ Concluído</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                      <span style={{ color: "#64748B", fontSize: 12 }}>Responsáveis:</span>
                      <ResponsaveisPicker
                        value={plano.responsaveis || []}
                        onChange={(ids) => setPlanoResponsaveis(plano.id, ids)}
                      />
                      <button onClick={() => setOpenNotasId(isNotasOpen ? null : plano.id)} style={{
                        display: "flex", alignItems: "center", gap: 5, background: isNotasOpen ? "#FEF3C7" : "#F8FAFC",
                        border: `1px solid ${isNotasOpen ? "#F59E0B50" : "#E2E8F0"}`, borderRadius: 8,
                        color: isNotasOpen ? "#B45309" : "#64748B", padding: "6px 10px", cursor: "pointer",
                        fontSize: 11, fontWeight: 700, fontFamily: "inherit"
                      }}>
                        <MessageSquare size={12} /> Notas {notasCount > 0 && `(${notasCount})`}
                      </button>
                    </div>
                    <p style={{ color: "#64748B", fontSize: 12, marginBottom: 10 }}>
                      {pd}/{pt} itens concluídos
                    </p>
                    <Bar2 pct={pp} color={area.color} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <div style={{ position: "relative", width: 64, height: 64, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Ring pct={pp} color={area.color} size={64} stroke={6} />
                      <span style={{ position: "absolute", color: "#0F172A", fontSize: 12, fontWeight: 800 }}>{pp}%</span>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => movePlano(plano.id, -1)} disabled={pIdx === 0} title="Mover para cima" style={{
                        background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 6, color: "#475569",
                        padding: "4px 6px", cursor: pIdx === 0 ? "not-allowed" : "pointer", display: "flex", opacity: pIdx === 0 ? 0.4 : 1
                      }}><ArrowUp size={12} /></button>
                      <button onClick={() => movePlano(plano.id, 1)} disabled={pIdx === cliente.planos.length - 1} title="Mover para baixo" style={{
                        background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 6, color: "#475569",
                        padding: "4px 6px", cursor: pIdx === cliente.planos.length - 1 ? "not-allowed" : "pointer", display: "flex", opacity: pIdx === cliente.planos.length - 1 ? 0.4 : 1
                      }}><ArrowDown size={12} /></button>
                    </div>
                    <button onClick={() => removePlano(plano.id)} style={{
                      background: "#ef444415", border: "1px solid #ef444430", borderRadius: 7,
                      color: "#ef4444", padding: "5px 8px", cursor: "pointer", display: "flex", alignItems: "center"
                    }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Notas block */}
                {isNotasOpen && (
                  <div style={{ marginTop: 14, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: 14 }}>
                    <p style={{ color: "#92400E", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                      Histórico de Notas — {plano.name}
                    </p>
                    {(plano.notas || []).length === 0 ? (
                      <p style={{ color: "#A16207", fontSize: 12, fontStyle: "italic", marginBottom: 10 }}>Nenhuma nota registrada ainda.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, maxHeight: 220, overflowY: "auto" }}>
                        {(plano.notas || []).map(n => (
                          <div key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, background: "#FFFFFF", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px" }}>
                            <p style={{ color: "#0F172A", fontSize: 12, lineHeight: 1.5, flex: 1 }}>
                              <span style={{ color: "#B45309", fontWeight: 700 }}>{n.date}</span>
                              {n.autor_nome && <span style={{ color: "#92400E", fontWeight: 600 }}> · {n.autor_nome}</span>}
                              {" — "}
                              <MentionText text={n.text} />
                            </p>
                            <button onClick={() => removeNota(plano.id, n.id)} title="Remover nota" style={{ background: "none", border: "none", color: "#CBD5E1", cursor: "pointer", padding: 2 }}>
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                      <MentionTextarea
                        value={notaDraft[plano.id] || ""}
                        onChange={(v) => setNotaDraft(d => ({ ...d, [plano.id]: v }))}
                        onSubmit={() => addNota(plano)}
                        placeholder="Nova nota... use @ para mencionar"
                      />
                      <button onClick={() => addNota(plano)} style={{
                        background: "#B45309", border: "none", borderRadius: 8, padding: "8px 14px",
                        color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                        display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                      }}>
                        <Plus size={13} /> Adicionar
                      </button>
                    </div>
                  </div>
                )}

                {/* Item preview */}
                {plano.items.length > 0 && (
                  <div style={{ marginTop: 14, background: "#F8FAFC", borderRadius: 10, padding: "8px 14px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {plano.items.slice(0, 4).map(it => (
                      <span key={it.id} style={{
                        padding: "3px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600,
                        background: `${area.color}15`, color: area.color, border: `1px solid ${area.color}25`
                      }}>{it.name.length > 28 ? it.name.slice(0, 28) + "…" : it.name}</span>
                    ))}
                    {plano.items.length > 4 && (
                      <span style={{ padding: "3px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, background: "#E2E8F0", color: "#64748B" }}>+{plano.items.length - 4} mais</span>
                    )}
                  </div>
                )}

                <button onClick={() => nav({ page: "plano", areaId, clienteId, planoId: plano.id })} style={{
                  width: "100%", marginTop: 14,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: `${area.color}18`, border: `1px solid ${area.color}30`, borderRadius: 10,
                  color: area.color, fontSize: 12, fontWeight: 700, padding: "9px 0",
                  cursor: "pointer", fontFamily: "inherit"
                }}>
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
function PlanoView({ areaId, clienteId, planoId, data, setData, nav }) {
  const area     = data.areas.find(a => a.id === areaId);
  const cliente  = area?.clientes.find(c => c.id === clienteId);
  const plano    = cliente?.planos.find(p => p.id === planoId);
  const currentUser = useCurrentUser();
  const allProfiles = useProfiles();
  const currentProfile = currentUser ? allProfiles.find(p => p.id === currentUser.id) : null;
  const [newName, setNewName]   = useState("");
  const [newTipo, setNewTipo]   = useState(TIPOS_ITEM[0]);
  const [newResp, setNewResp]   = useState("");
  const [showForm, setShowForm] = useState(false);
  const [dragItemId, setDragItemId] = useState(null);
  const [dragOverItemId, setDragOverItemId] = useState(null);

  function reorderItems(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setPlanos(planos => planos.map(p => p.id !== planoId ? p : { ...p, items: reorderById(p.items, sourceId, targetId) }));
  }

  if (!plano) return null;
  const { total, done, pct } = prog(plano.items);

  function updateItemsAndResort(planos, planoId, mutator) {
    return sortPlanosByCompletion(planos.map(p => {
      if (p.id !== planoId) return p;
      const nextItems = sortItemsByCompletion(mutator(p.items));
      return { ...p, items: nextItems };
    }));
  }
  function setPlanos(updater) {
    setData(d => ({ ...d, areas: d.areas.map(a => a.id !== areaId ? a : {
      ...a, clientes: a.clientes.map(c => c.id !== clienteId ? c : { ...c, planos: updater(c.planos) })
    })}));
  }
  function addItem() {
    if (!newName.trim()) return;
    const item = { id: `it${uid()}`, name: newName.trim(), tipo: newTipo, responsavel: newResp.trim(), responsaveis: [], status: "Não iniciado", obs: "", prazo: "" };
    setPlanos(planos => updateItemsAndResort(planos, planoId, items => [...items, item]));
    setNewName(""); setNewResp(""); setShowForm(false);
  }
  function updateItem(itemId, field, val) {
    setPlanos(planos => updateItemsAndResort(planos, planoId, items =>
      items.map(it => it.id !== itemId ? it : { ...it, [field]: val })
    ));
  }
  function removeItem(itemId) {
    setPlanos(planos => updateItemsAndResort(planos, planoId, items => items.filter(it => it.id !== itemId)));
  }
  function moveItem(itemId, dir) {
    setPlanos(planos => planos.map(p => {
      if (p.id !== planoId) return p;
      const idx = p.items.findIndex(it => it.id === itemId);
      if (idx < 0) return p;
      return { ...p, items: moveInArray(p.items, idx, dir) };
    }));
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 22, flexWrap: "wrap" }}>
        <button onClick={() => nav({ page: "dashboard" })} style={{ color: "#94A3B8", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Painel</button>
        <ChevronRight size={13} color="#334155" />
        <button onClick={() => nav({ page: "area", areaId })} style={{ color: "#94A3B8", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>{area.name}</button>
        <ChevronRight size={13} color="#334155" />
        <button onClick={() => nav({ page: "cliente", areaId, clienteId })} style={{ color: "#94A3B8", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>{cliente.name}</button>
        <ChevronRight size={13} color="#334155" />
        <span style={{ color: "#64748B", fontSize: 12, fontWeight: 600 }}>{plano.name}</span>
      </div>

      {/* Header */}
      <div style={{ background: "#FFFFFF", border: `1px solid ${area.color}30`, borderRadius: 16, padding: 24, marginBottom: 22, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <FolderOpen size={20} color={area.color} />
            <h2 style={{ color: "#0F172A", fontSize: 20, fontWeight: 900 }}>{plano.name}</h2>
          </div>
          <p style={{ color: "#64748B", fontSize: 12 }}>{cliente.name} · {area.name}</p>
          {plano.responsavel && (
            <p style={{ color: "#64748B", fontSize: 12, marginTop: 4 }}>
              <User size={11} style={{ display: "inline", marginRight: 4 }} />
              Responsável: {plano.responsavel}
            </p>
          )}
          <p style={{ color: "#64748B", fontSize: 12, marginTop: 8 }}>{done}/{total} itens concluídos</p>
        </div>
        <div style={{ position: "relative", width: 90, height: 90, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Ring pct={pct} color={area.color} size={90} stroke={8} />
          <div style={{ position: "absolute", textAlign: "center" }}>
            <p style={{ color: "#0F172A", fontSize: 16, fontWeight: 900 }}>{pct}%</p>
          </div>
        </div>
      </div>

      {/* Add item button / form */}
      {!showForm ? (
        <button onClick={() => setShowForm(true)} style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 20,
          background: `${area.color}18`, border: `1px dashed ${area.color}50`, borderRadius: 10,
          color: area.color, fontSize: 13, fontWeight: 700, padding: "10px 18px",
          cursor: "pointer", fontFamily: "inherit"
        }}>
          <Plus size={15} /> Adicionar Item
        </button>
      ) : (
        <div style={{ background: "#FFFFFF", border: `1px solid ${area.color}30`, borderRadius: 12, padding: 18, marginBottom: 20 }}>
          <p style={{ color: area.color, fontSize: 12, fontWeight: 700, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Novo Item</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={newTipo} onChange={e => setNewTipo(e.target.value)} style={{
              ...inp, width: 160, cursor: "pointer"
            }}>
              {TIPOS_ITEM.map(t => <option key={t} value={t} style={{ background: "#F8FAFC" }}>{t}</option>)}
            </select>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addItem()}
              placeholder="Nome do item..."
              style={{ ...inp, flex: 1, minWidth: 200 }} />
            <input value={newResp} onChange={e => setNewResp(e.target.value)}
              placeholder="Responsável..."
              style={{ ...inp, width: 180 }} />
            <button onClick={addItem} style={{
              background: area.color, border: "none", borderRadius: 8, padding: "7px 14px",
              color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
              fontSize: 12, fontWeight: 700, fontFamily: "inherit"
            }}>
              <Plus size={14} /> Adicionar
            </button>
            <button onClick={() => setShowForm(false)} style={{
              background: "#F1F5F9", border: "1px solid #2a3550", borderRadius: 8, padding: "7px 12px",
              color: "#64748B", cursor: "pointer", display: "flex", alignItems: "center",
              fontFamily: "inherit"
            }}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Items table */}
      {plano.items.length === 0 ? (
        <div style={{ background: "#FFFFFF", border: "1px dashed #1e2d45", borderRadius: 14, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#94A3B8", fontSize: 13, fontWeight: 600 }}>Nenhum item neste plano</p>
          <p style={{ color: "#E2E8F0", fontSize: 12, marginTop: 4 }}>Adicione organogramas, políticas, procedimentos e mais</p>
        </div>
      ) : (
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          {/* Table header */}
          <div style={{
            display: "grid", gridTemplateColumns: "130px 1fr 160px 180px 155px 60px 36px",
            gap: 12, padding: "14px 22px",
            borderBottom: "1px solid #E2E8F0", background: "#F8FAFC",
            borderRadius: "16px 16px 0 0"
          }}>
            {["Tipo", "Nome do Item", "Responsável", "Observação", "Status", "Mover", ""].map((h, i) => (
              <span key={i} style={{ color: "#94A3B8", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7 }}>{h}</span>
            ))}
          </div>
          {plano.items.map((item, idx) => {
            const itemDone = item.status === "Concluído";
            const isDragging = dragItemId === item.id;
            const isDragOver = dragOverItemId === item.id && dragItemId !== item.id;
            return (
            <div key={item.id} id={`item-${item.id}`}
              draggable
              onDragStart={(e) => { setDragItemId(item.id); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragOverItemId !== item.id) setDragOverItemId(item.id); }}
              onDragLeave={() => { if (dragOverItemId === item.id) setDragOverItemId(null); }}
              onDrop={(e) => { e.preventDefault(); reorderItems(dragItemId, item.id); setDragItemId(null); setDragOverItemId(null); }}
              onDragEnd={() => { setDragItemId(null); setDragOverItemId(null); }}
              style={{
                display: "grid", gridTemplateColumns: "130px 1fr 160px 180px 155px 60px 36px",
                alignItems: "center", gap: 12, padding: "16px 22px",
                borderBottom: idx < plano.items.length - 1 ? "1px solid #F1F5F9" : "none",
                transition: "background 0.15s, box-shadow 0.15s",
                opacity: isDragging ? 0.4 : (itemDone ? 0.7 : 1),
                boxShadow: isDragOver ? `inset 0 2px 0 ${area.color}` : "none",
                cursor: "grab",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{
                padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                background: `${area.color}15`, color: area.color, border: `1px solid ${area.color}30`,
                display: "inline-block", textAlign: "center", whiteSpace: "nowrap"
              }}>{item.tipo}</span>

              <p style={{ color: "#1E293B", fontSize: 14, fontWeight: 500, lineHeight: 1.4, textDecoration: itemDone ? "line-through" : "none" }}>{item.name}</p>

              <ResponsaveisPicker
                value={item.responsaveis || []}
                onChange={(ids) => {
                  const old = item.responsaveis || [];
                  updateItem(item.id, "responsaveis", ids);
                  emitAtribuicao({
                    newIds: ids, oldIds: old,
                    ctx: {
                      cliente_id: clienteId, cliente_nome: cliente?.name || "",
                      modulo: moduloOf(areaId),
                      plano_id: planoId, plano_nome: plano?.name || "",
                      item_id: item.id, item_nome: item.name,
                      autor_id: currentUser?.id || null,
                      autor_nome: currentProfile?.display_name || currentUser?.email || "Alguém",
                      trecho: `Adicionado como responsável em "${item.name}"`,
                    },
                  });
                }}
                compact
                label="Resp."
              />

              <input value={item.obs} onChange={e => updateItem(item.id, "obs", e.target.value)}
                placeholder="Observação..."
                style={{ ...inp, width: "100%", fontSize: 12 }} />

              <StatusPill status={item.status} onChange={val => updateItem(item.id, "status", val)} />

              <div style={{ display: "flex", gap: 3 }}>
                <button onClick={() => moveItem(item.id, -1)} disabled={idx === 0} title="Mover para cima" style={{
                  background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 6, color: "#475569",
                  padding: "4px 5px", cursor: idx === 0 ? "not-allowed" : "pointer", display: "flex", opacity: idx === 0 ? 0.4 : 1
                }}><ArrowUp size={11} /></button>
                <button onClick={() => moveItem(item.id, 1)} disabled={idx === plano.items.length - 1} title="Mover para baixo" style={{
                  background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 6, color: "#475569",
                  padding: "4px 5px", cursor: idx === plano.items.length - 1 ? "not-allowed" : "pointer", display: "flex", opacity: idx === plano.items.length - 1 ? 0.4 : 1
                }}><ArrowDown size={11} /></button>
              </div>

              <button onClick={() => removeItem(item.id)} style={{
                background: "none", border: "none", cursor: "pointer", color: "#CBD5E1",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 6, borderRadius: 8,
                transition: "color 0.15s, background 0.15s"
              }}
                onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "#FEE2E2"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "#CBD5E1"; e.currentTarget.style.background = "none"; }}
              >
                <Trash2 size={14} />
              </button>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Produtos View ─────────────────────────────────────────────────────────────
const PRESET_COLORS = ["#8B5CF6","#06B6D4","#10B981","#F59E0B","#EC4899","#F97316","#3B82F6","#EF4444","#0DD3C5","#84CC16"];
const PRESET_EMOJIS = ["📊","📄","📑","🔍","🛡️","💡","🚀","📋","🔒","⚙️","🎯","📈","🤝","💼","🌐"];

function ProdutosView({ data, setData, nav }) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newEmoji, setNewEmoji] = useState("🚀");
  const [newColor, setNewColor] = useState("#8B5CF6");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Count clients using Canal de Ética across all areas
  const canalEticaClients = data.areas.flatMap(a =>
    a.clientes.filter(c => c.canalEtica).map(c => ({ ...c, area: a.name }))
  );

  function addProduto() {
    if (!newName.trim()) return;
    const prod = {
      id: `prod${uid()}`, name: newName.trim(), emoji: newEmoji,
      color: newColor, responsavel: "", descricao: newDesc.trim() || "Novo produto Adeke",
      items: [], notas: [], informacoes: [],
    };
    setData(d => ({ ...d, produtos: [...d.produtos, prod] }));
    setNewName(""); setNewDesc(""); setNewEmoji("🚀"); setNewColor("#8B5CF6");
    setShowForm(false);
    nav({ page: "produto", prodId: prod.id });
  }

  function removeProduto(e, pId) {
    e.stopPropagation();
    if (!confirm("Remover este produto?")) return;
    setData(d => ({ ...d, produtos: d.produtos.filter(p => p.id !== pId) }));
  }

  return (
    <div>
      <button onClick={() => nav({ page: "dashboard" })} style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748B", background: "none", border: "none", cursor: "pointer", fontSize: 13, marginBottom: 22, fontFamily: "inherit" }}>
        <ArrowLeft size={15} /> Voltar ao Painel
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
        <h2 style={{ color: "#0F172A", fontSize: 20, fontWeight: 900 }}>
          <span style={{ color: "#8B5CF6" }}>Produtos</span> & Soluções
        </h2>
        <button onClick={() => setShowForm(f => !f)} style={{
          display: "flex", alignItems: "center", gap: 7, padding: "9px 18px",
          background: showForm ? "#F1F5F9" : "#8B5CF6", border: showForm ? "1px solid #E2E8F0" : "none",
          borderRadius: 10, color: showForm ? "#64748B" : "#fff",
          fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
        }}>
          {showForm ? <X size={15} /> : <Plus size={15} />} {showForm ? "Cancelar" : "Novo Produto"}
        </button>
      </div>

      {/* ── Add Product Form ── */}
      {showForm && (
        <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <p style={{ color: "#8B5CF6", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, marginBottom: 18 }}>Novo Produto ou Solução</p>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
            {/* Emoji picker */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowEmojiPicker(p => !p)} style={{
                width: 52, height: 52, borderRadius: 12, fontSize: 26, border: "2px solid #E2E8F0",
                background: "#F8FAFC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
              }}>{newEmoji}</button>
              {showEmojiPicker && (
                <div style={{
                  position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 99,
                  background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12,
                  padding: 12, display: "flex", flexWrap: "wrap", gap: 6, width: 220,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.1)"
                }}>
                  {PRESET_EMOJIS.map(e => (
                    <button key={e} onClick={() => { setNewEmoji(e); setShowEmojiPicker(false); }} style={{
                      width: 36, height: 36, borderRadius: 8, fontSize: 20, border: e === newEmoji ? "2px solid #8B5CF6" : "1px solid #E2E8F0",
                      background: e === newEmoji ? "#F5F3FF" : "#F8FAFC", cursor: "pointer"
                    }}>{e}</button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 200 }}>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addProduto()}
                placeholder="Nome do produto ou solução..."
                style={{ ...inp, width: "100%", fontSize: 15, fontWeight: 700, marginBottom: 8, padding: "10px 14px" }} />
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="Descrição (opcional)..."
                style={{ ...inp, width: "100%", fontSize: 13 }} />
            </div>
          </div>

          {/* Color swatches */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
            <span style={{ color: "#64748B", fontSize: 12, fontWeight: 600 }}>Cor:</span>
            {PRESET_COLORS.map(c => (
              <button key={c} onClick={() => setNewColor(c)} style={{
                width: 28, height: 28, borderRadius: 8, background: c, border: c === newColor ? `3px solid #0F172A` : "2px solid transparent",
                cursor: "pointer", transform: c === newColor ? "scale(1.15)" : "scale(1)", transition: "transform 0.1s"
              }} />
            ))}
          </div>

          {/* Preview & Save */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: `${newColor}10`, border: `1px solid ${newColor}30`, borderRadius: 10, padding: "8px 14px" }}>
              <span style={{ fontSize: 20 }}>{newEmoji}</span>
              <div>
                <p style={{ color: newColor, fontSize: 13, fontWeight: 800 }}>{newName || "Nome do produto"}</p>
                <p style={{ color: "#94A3B8", fontSize: 11 }}>{newDesc || "Descrição"}</p>
              </div>
            </div>
            <button onClick={addProduto} style={{
              background: newColor, border: "none", borderRadius: 10, padding: "10px 22px",
              color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
              fontSize: 13, fontWeight: 800, fontFamily: "inherit"
            }}>
              <Plus size={15} /> Criar Produto
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {data.produtos.map(p => {
          const { total: t, done: d, pct } = prog(p.items);
          // If Canal de Ética, show client count
          const isCanal = p.isCanalEtica;
          return (
            <button key={p.id} onClick={() => nav({ page: "produto", prodId: p.id })} style={{
              background: "#FFFFFF", border: `1px solid ${p.color}28`,
              borderRadius: 16, padding: 24, cursor: "pointer", textAlign: "left",
              transition: "border-color 0.15s, background 0.15s", position: "relative"
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `${p.color}60`; e.currentTarget.style.background = `${p.color}06`; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = `${p.color}28`; e.currentTarget.style.background = "#FFFFFF"; }}
            >
              {/* Remove button (for non-built-in products) */}
              {!["financeiro","proposta","contractia","crivo","canal-etica"].includes(p.id) && (
                <button onClick={e => removeProduto(e, p.id)} style={{
                  position: "absolute", top: 12, right: 12,
                  background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 7,
                  color: "#ef4444", padding: "4px 6px", cursor: "pointer", display: "flex", alignItems: "center"
                }}>
                  <Trash2 size={11} />
                </button>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, marginRight: 14 }}>
                  <div style={{ fontSize: 26, marginBottom: 10 }}>{p.emoji}</div>
                  <p style={{ color: "#0F172A", fontSize: 17, fontWeight: 900, marginBottom: 4 }}>{p.name}</p>
                  <p style={{ color: "#64748B", fontSize: 12, marginBottom: 16 }}>{p.descricao}</p>

                  {/* Canal de Ética: show linked clients */}
                  {isCanal ? (
                    <div style={{ marginBottom: 12 }}>
                      {canalEticaClients.length === 0 ? (
                        <span style={{ fontSize: 11, color: "#94A3B8", fontStyle: "italic" }}>Nenhum cliente vinculado ainda</span>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {canalEticaClients.map(c => (
                            <span key={c.id} style={{
                              padding: "3px 9px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                              background: "#FDF2F8", color: "#EC4899", border: "1px solid #EC489930"
                            }}>🏢 {c.name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ color: "#64748B", fontSize: 11 }}>{d}/{t} etapas</span>
                        <span style={{ color: p.color, fontSize: 11, fontWeight: 700 }}>{pct}%</span>
                      </div>
                      <Bar2 pct={pct} color={p.color} />
                    </>
                  )}

                  <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                    {(p.notas||[]).length > 0 && (
                      <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, background: "#E2E8F0", color: "#64748B" }}>
                        📝 {p.notas.length} nota{p.notas.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {(p.informacoes||[]).length > 0 && (
                      <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, background: "#E2E8F0", color: "#64748B" }}>
                        ℹ️ {p.informacoes.length} info
                      </span>
                    )}
                    {isCanal && canalEticaClients.length > 0 && (
                      <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: "#FDF2F8", color: "#EC4899", border: "1px solid #EC489930" }}>
                        🛡️ {canalEticaClients.length} cliente{canalEticaClients.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ position: "relative", width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ring pct={isCanal ? Math.round((canalEticaClients.length / Math.max(data.areas.flatMap(a => a.clientes).length, 1)) * 100) : pct} color={p.color} size={80} />
                  <span style={{ position: "absolute", color: "#0F172A", fontSize: isCanal ? 13 : 14, fontWeight: 800 }}>
                    {isCanal ? `${canalEticaClients.length}cl` : `${pct}%`}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, color: p.color, fontSize: 11, fontWeight: 700, marginTop: 14, justifyContent: "flex-end" }}>
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
  const prod = data.produtos.find(p => p.id === prodId);
  const [tab, setTab] = useState("roadmap");
  const [newInfoCampo, setNewInfoCampo] = useState("");
  const [newInfoValor, setNewInfoValor] = useState("");
  const [newNotaTitulo, setNewNotaTitulo] = useState("");
  const [newNotaTexto, setNewNotaTexto] = useState("");
  const [newEtapa, setNewEtapa] = useState("");

  if (!prod) return null;
  const { total: t, done: d, pct } = prog(prod.items);

  const upd = (field, val) =>
    setData(dd => ({ ...dd, produtos: dd.produtos.map(p => p.id !== prodId ? p : { ...p, [field]: val }) }));
  const setStatus = (iIdx, val) =>
    setData(dd => ({ ...dd, produtos: dd.produtos.map(p => p.id !== prodId ? p : {
      ...p, items: p.items.map((it, i) => i !== iIdx ? it : { ...it, status: val })
    })}));
  const setObs = (iIdx, val) =>
    setData(dd => ({ ...dd, produtos: dd.produtos.map(p => p.id !== prodId ? p : {
      ...p, items: p.items.map((it, i) => i !== iIdx ? it : { ...it, obs: val })
    })}));
  const setPrazo = (iIdx, val) =>
    setData(dd => ({ ...dd, produtos: dd.produtos.map(p => p.id !== prodId ? p : {
      ...p, items: p.items.map((it, i) => i !== iIdx ? it : { ...it, prazo: val })
    })}));
  const addEtapa = () => {
    if (!newEtapa.trim()) return;
    const item = { id: `e${uid()}`, name: newEtapa.trim(), status: "Não iniciado", prazo: "", obs: "" };
    setData(dd => ({ ...dd, produtos: dd.produtos.map(p => p.id !== prodId ? p : { ...p, items: [...p.items, item] }) }));
    setNewEtapa("");
  };
  const removeEtapa = (iIdx) => {
    setData(dd => ({ ...dd, produtos: dd.produtos.map(p => p.id !== prodId ? p : { ...p, items: p.items.filter((_, i) => i !== iIdx) }) }));
  };

  // Informações
  const addInfo = () => {
    if (!newInfoCampo.trim()) return;
    const info = { id: `inf${uid()}`, campo: newInfoCampo.trim(), valor: newInfoValor.trim() };
    setData(dd => ({ ...dd, produtos: dd.produtos.map(p => p.id !== prodId ? p : { ...p, informacoes: [...(p.informacoes || []), info] }) }));
    setNewInfoCampo(""); setNewInfoValor("");
  };
  const removeInfo = (id) =>
    setData(dd => ({ ...dd, produtos: dd.produtos.map(p => p.id !== prodId ? p : { ...p, informacoes: p.informacoes.filter(i => i.id !== id) }) }));
  const updateInfoValor = (id, val) =>
    setData(dd => ({ ...dd, produtos: dd.produtos.map(p => p.id !== prodId ? p : {
      ...p, informacoes: p.informacoes.map(i => i.id !== id ? i : { ...i, valor: val })
    }) }));

  // Notas
  const addNota = () => {
    if (!newNotaTitulo.trim() && !newNotaTexto.trim()) return;
    const nota = { id: `nota${uid()}`, titulo: newNotaTitulo.trim() || "Sem título", texto: newNotaTexto.trim(), data: new Date().toLocaleDateString("pt-BR") };
    setData(dd => ({ ...dd, produtos: dd.produtos.map(p => p.id !== prodId ? p : { ...p, notas: [...(p.notas || []), nota] }) }));
    setNewNotaTitulo(""); setNewNotaTexto("");
  };
  const removeNota = (id) =>
    setData(dd => ({ ...dd, produtos: dd.produtos.map(p => p.id !== prodId ? p : { ...p, notas: p.notas.filter(n => n.id !== id) }) }));
  const updateNotaTexto = (id, val) =>
    setData(dd => ({ ...dd, produtos: dd.produtos.map(p => p.id !== prodId ? p : {
      ...p, notas: p.notas.map(n => n.id !== id ? n : { ...n, texto: val })
    }) }));

  const tabs = [
    { id: "roadmap", label: "Roadmap", count: prod.items.length },
    { id: "info", label: "Informações", count: (prod.informacoes || []).length },
    { id: "notas", label: "Notas", count: (prod.notas || []).length },
  ];

  // Canal de Ética: count linked clients
  const canalEticaClients = prod.isCanalEtica
    ? data.areas.flatMap(a => a.clientes.filter(c => c.canalEtica).map(c => ({ ...c, areaName: a.name, areaColor: a.color })))
    : [];

  return (
    <div>
      <button onClick={() => nav({ page: "produtos" })} style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748B", background: "none", border: "none", cursor: "pointer", fontSize: 13, marginBottom: 22, fontFamily: "inherit" }}>
        <ArrowLeft size={15} /> Voltar a Produtos
      </button>

      {/* Header */}
      <div style={{ background: "#FFFFFF", border: `1px solid ${prod.color}30`, borderRadius: 16, padding: 26, marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 32 }}>{prod.emoji}</span>
              <div>
                <h2 style={{ color: "#0F172A", fontSize: 20, fontWeight: 900 }}>{prod.name}</h2>
                <input value={prod.descricao} onChange={e => upd("descricao", e.target.value)}
                  style={{ background: "none", border: "none", color: "#64748B", fontSize: 12, fontFamily: "inherit", outline: "none", width: 340, padding: 0 }}
                  placeholder="Descrição do produto..." />
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: prod.isCanalEtica ? 16 : 0 }}>
              <User size={13} color="#475569" />
              <span style={{ color: "#64748B", fontSize: 12 }}>Responsável:</span>
              <input value={prod.responsavel} onChange={e => upd("responsavel", e.target.value)}
                placeholder="Nome do responsável..."
                style={{ ...inp, width: 200 }} />
            </label>

            {/* Canal de Ética: clientes vinculados */}
            {prod.isCanalEtica && (
              <div style={{ marginTop: 4 }}>
                <p style={{ color: "#64748B", fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                  🛡️ Clientes usando este canal:
                  {canalEticaClients.length === 0 && <span style={{ color: "#94A3B8", fontWeight: 400, marginLeft: 6, fontStyle: "italic" }}>nenhum ainda — ative nas áreas de Compliance ou LGPD</span>}
                </p>
                {canalEticaClients.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {canalEticaClients.map(c => (
                      <span key={c.id} style={{
                        padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                        background: "#FDF2F8", color: "#EC4899", border: "1px solid #EC489940",
                        display: "flex", alignItems: "center", gap: 5
                      }}>
                        🏢 {c.name}
                        <span style={{ color: "#F9A8D4", fontSize: 10 }}>· {c.areaName}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ position: "relative", width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ring pct={prod.isCanalEtica
              ? Math.round((canalEticaClients.length / Math.max(data.areas.flatMap(a => a.clientes).length, 1)) * 100)
              : pct} color={prod.color} size={100} stroke={9} />
            <div style={{ position: "absolute", textAlign: "center" }}>
              {prod.isCanalEtica ? (
                <>
                  <p style={{ color: "#0F172A", fontSize: 20, fontWeight: 900 }}>{canalEticaClients.length}</p>
                  <p style={{ color: "#64748B", fontSize: 10 }}>clientes</p>
                </>
              ) : (
                <>
                  <p style={{ color: "#0F172A", fontSize: 18, fontWeight: 900 }}>{pct}%</p>
                  <p style={{ color: "#64748B", fontSize: 10 }}>{d}/{t}</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {tabs.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)} style={{
            display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 10,
            border: tab === tb.id ? `1px solid ${prod.color}40` : "1px solid #1e2d45",
            background: tab === tb.id ? `${prod.color}18` : "#FFFFFF",
            color: tab === tb.id ? prod.color : "#475569",
            fontSize: 13, fontWeight: tab === tb.id ? 700 : 500,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s"
          }}>
            {tb.id === "roadmap" ? <Activity size={14} /> : tb.id === "info" ? <Info size={14} /> : <StickyNote size={14} />}
            {tb.label}
            {tb.count > 0 && (
              <span style={{ background: tab === tb.id ? `${prod.color}30` : "#E2E8F0", color: tab === tb.id ? prod.color : "#475569", borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>{tb.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Roadmap Tab ── */}
      {tab === "roadmap" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input value={newEtapa} onChange={e => setNewEtapa(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addEtapa()}
              placeholder="Nome da nova etapa..."
              style={{ ...inp, flex: 1, fontSize: 13, padding: "9px 14px" }} />
            <button onClick={addEtapa} style={{
              background: prod.color, border: "none", borderRadius: 8, padding: "9px 14px",
              color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
              fontSize: 12, fontWeight: 700, fontFamily: "inherit"
            }}>
              <Plus size={14} /> Etapa
            </button>
          </div>

          <p style={{ color: prod.color, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Roadmap & Etapas</p>
          <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            {prod.items.map((item, iIdx) => (
              <div key={item.id} style={{
                display: "grid", gridTemplateColumns: "38px 1fr 130px 190px auto 42px",
                alignItems: "center", gap: 16, padding: "18px 26px",
                borderBottom: iIdx < prod.items.length - 1 ? "1px solid #F1F5F9" : "none",
                transition: "background 0.1s"
              }}
                onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                  background: item.status === "Concluído" ? prod.color : "#EEF2F8",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: item.status === "Concluído" ? "#fff" : "#94A3B8",
                  fontSize: 13, fontWeight: 800
                }}>
                  {item.status === "Concluído" ? <CheckCircle size={15} /> : iIdx + 1}
                </div>
                <p style={{ color: "#1E293B", fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>{item.name}</p>
                <input value={item.prazo} onChange={e => setPrazo(iIdx, e.target.value)}
                  placeholder="Prazo..." style={{ ...inp, width: "100%", fontSize: 12 }} />
                <input value={item.obs} onChange={e => setObs(iIdx, e.target.value)}
                  placeholder="Observação..." style={{ ...inp, width: "100%", fontSize: 12 }} />
                <StatusPill status={item.status} onChange={val => setStatus(iIdx, val)} />
                <button onClick={() => removeEtapa(iIdx)} style={{
                  background: "none", border: "none", cursor: "pointer", color: "#CBD5E1", padding: 6, borderRadius: 8,
                  transition: "color 0.15s, background 0.15s"
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "#FEE2E2"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "#CBD5E1"; e.currentTarget.style.background = "none"; }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {prod.items.length === 0 && (
              <div style={{ padding: 40, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
                Nenhuma etapa cadastrada. Adicione a primeira etapa acima.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Informações Tab ── */}
      {tab === "info" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <input value={newInfoCampo} onChange={e => setNewInfoCampo(e.target.value)}
              placeholder="Campo (ex: Mercado Alvo)..."
              style={{ ...inp, width: 200 }} />
            <input value={newInfoValor} onChange={e => setNewInfoValor(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addInfo()}
              placeholder="Valor..."
              style={{ ...inp, flex: 1 }} />
            <button onClick={addInfo} style={{
              background: prod.color, border: "none", borderRadius: 8, padding: "7px 14px",
              color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
              fontSize: 12, fontWeight: 700, fontFamily: "inherit"
            }}>
              <Plus size={14} /> Adicionar
            </button>
          </div>

          {(prod.informacoes || []).length === 0 ? (
            <div style={{ background: "#FFFFFF", border: "1px dashed #1e2d45", borderRadius: 14, padding: 40, textAlign: "center" }}>
              <Info size={24} color="#E2E8F0" style={{ margin: "0 auto 10px" }} />
              <p style={{ color: "#94A3B8", fontSize: 13, fontWeight: 600 }}>Nenhuma informação cadastrada</p>
              <p style={{ color: "#E2E8F0", fontSize: 12, marginTop: 4 }}>Adicione campos como Mercado Alvo, Tecnologia, Parceiros, etc.</p>
            </div>
          ) : (
            <div style={{ background: "#FFFFFF", border: "1px solid #1e2d45", borderRadius: 14, overflow: "hidden" }}>
              {(prod.informacoes || []).map((info, idx) => (
                <div key={info.id} style={{
                  display: "grid", gridTemplateColumns: "200px 1fr 36px",
                  alignItems: "center", gap: 12, padding: "13px 18px",
                  borderBottom: idx < prod.informacoes.length - 1 ? "1px solid #111827" : "none",
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: prod.color, flexShrink: 0 }} />
                    <p style={{ color: prod.color, fontSize: 13, fontWeight: 700 }}>{info.campo}</p>
                  </div>
                  <input value={info.valor} onChange={e => updateInfoValor(info.id, e.target.value)}
                    placeholder="Valor..."
                    style={{ ...inp, width: "100%" }} />
                  <button onClick={() => removeInfo(info.id)} style={{
                    background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 4, borderRadius: 6,
                  }}
                    onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                    onMouseLeave={e => e.currentTarget.style.color = "#CBD5E1"}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Notas Tab ── */}
      {tab === "notas" && (
        <div>
          <div style={{ background: "#FFFFFF", border: `1px solid ${prod.color}25`, borderRadius: 12, padding: 18, marginBottom: 20 }}>
            <p style={{ color: prod.color, fontSize: 11, fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Nova Nota</p>
            <input value={newNotaTitulo} onChange={e => setNewNotaTitulo(e.target.value)}
              placeholder="Título da nota..."
              style={{ ...inp, width: "100%", marginBottom: 8, fontSize: 13 }} />
            <textarea value={newNotaTexto} onChange={e => setNewNotaTexto(e.target.value)}
              placeholder="Escreva sua nota, observação ou informação importante..."
              rows={4}
              style={{
                ...inp, width: "100%", resize: "vertical", marginBottom: 10, fontSize: 13, lineHeight: 1.6
              }} />
            <button onClick={addNota} style={{
              background: prod.color, border: "none", borderRadius: 8, padding: "8px 16px",
              color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              fontSize: 13, fontWeight: 700, fontFamily: "inherit"
            }}>
              <Plus size={14} /> Salvar Nota
            </button>
          </div>

          {(prod.notas || []).length === 0 ? (
            <div style={{ background: "#FFFFFF", border: "1px dashed #1e2d45", borderRadius: 14, padding: 40, textAlign: "center" }}>
              <StickyNote size={24} color="#E2E8F0" style={{ margin: "0 auto 10px" }} />
              <p style={{ color: "#94A3B8", fontSize: 13, fontWeight: 600 }}>Nenhuma nota adicionada</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(prod.notas || []).map(nota => (
                <div key={nota.id} style={{
                  background: "#FFFFFF", border: `1px solid ${prod.color}20`,
                  borderRadius: 14, padding: 20,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <p style={{ color: "#0F172A", fontSize: 14, fontWeight: 700 }}>{nota.titulo}</p>
                      <p style={{ color: "#64748B", fontSize: 11, marginTop: 2 }}>{nota.data}</p>
                    </div>
                    <button onClick={() => removeNota(nota.id)} style={{
                      background: "#ef444415", border: "1px solid #ef444430", borderRadius: 7,
                      color: "#ef4444", padding: "4px 8px", cursor: "pointer", display: "flex", alignItems: "center"
                    }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <textarea value={nota.texto} onChange={e => updateNotaTexto(nota.id, e.target.value)}
                    rows={3}
                    style={{
                      ...inp, width: "100%", resize: "vertical", fontSize: 13,
                      lineHeight: 1.6, color: "#64748B"
                    }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── NAV Config ───────────────────────────────────────────────────────────────
const NAV = [
  { id: "dashboard", label: "Painel Geral",      Icon: Home,   color: "#64748B", view: { page: "dashboard" } },
  { id: "compliance", label: "Compliance & Ética", Icon: Shield, color: "#3B82F6", view: { page: "area", areaId: "compliance" } },
  { id: "lgpd",      label: "LGPD & Privacidade", Icon: Lock,   color: "#10B981", view: { page: "area", areaId: "lgpd" } },
  { id: "produtos",  label: "Produtos & Soluções", Icon: Rocket, color: "#8B5CF6", view: { page: "produtos" } },
];

function navActiveId(view) {
  if (view.page === "dashboard") return "dashboard";
  if (view.page === "area" || view.page === "cliente" || view.page === "plano") return view.areaId;
  if (view.page === "produtos" || view.page === "produto") return "produtos";
  return "";
}

// ─── App ──────────────────────────────────────────────────────────────────────
import { supabase } from "@/integrations/supabase/client";

const ROW_ID = "main";

export default function App() {
  const [data, setDataState] = useState(INIT);
  const [view, setView] = useState({ page: "dashboard" });
  const [loaded, setLoaded] = useState(false);
  const activeId = navActiveId(view);

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
        remoteRef.current = true;
        setDataState(row.data);
        dataRef.current = row.data;
        lastSentJsonRef.current = JSON.stringify(row.data);
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
        }
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
      const areaId = d.modulo === "LGPD" ? "lgpd" : d.modulo === "Compliance" ? "compliance" : null;
      if (!areaId || !d.cliente) return;
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
            setTimeout(() => { el.style.boxShadow = ""; el.style.background = ""; }, 2200);
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
  }, []);

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
        <aside style={{
          width: 220, background: "#FFFFFF", borderRight: "1px solid #E2E8F0",
          padding: "26px 14px", display: "flex", flexDirection: "column",
          position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 100
        }}>
          <div style={{ paddingLeft: 10, marginBottom: 36 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#0F172A", letterSpacing: -0.5 }}>
              <span style={{ color: "#0DD3C5" }}>A</span>DEKE
            </div>
            <div style={{ color: "#94A3B8", fontSize: 10, marginTop: 2, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Gestão Estratégica</div>
          </div>
          <nav style={{ flex: 1 }}>
            {NAV.map(({ id, label, Icon, color, view: v }) => {
              const active = activeId === id;
              const c = color || "#475569";
              return (
                <button key={id} onClick={() => setView(v)} style={{
                  display: "flex", alignItems: "center", gap: 9, width: "100%",
                  padding: "9px 12px", borderRadius: 10, border: "none",
                  background: active ? `${c}18` : "transparent",
                  color: active ? c : "#64748B", fontSize: 13,
                  fontWeight: active ? 700 : 500, cursor: "pointer",
                  marginBottom: 3, textAlign: "left", transition: "all 0.15s"
                }}
                  onMouseEnter={e => !active && (e.currentTarget.style.background = "#F1F5F9")}
                  onMouseLeave={e => !active && (e.currentTarget.style.background = "transparent")}
                >
                  <Icon size={15} /> {label}
                </button>
              );
            })}
          </nav>
          <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: 14, color: "#94A3B8", fontSize: 10, fontWeight: 600, letterSpacing: 0.5 }}>
            © 2026 ADEKE
          </div>
        </aside>

        {/* Main content */}
        <main style={{ marginLeft: 220, flex: 1, padding: "40px 44px", minHeight: "100vh", overflowX: "hidden" }}>
          {view.page === "dashboard" && <Dashboard data={data} setData={setData} nav={setView} />}
          {view.page === "area"     && <AreaView     areaId={view.areaId} data={data} setData={setData} nav={setView} />}
          {view.page === "cliente"  && <ClienteView  areaId={view.areaId} clienteId={view.clienteId} data={data} setData={setData} nav={setView} />}
          {view.page === "plano"    && <PlanoView     areaId={view.areaId} clienteId={view.clienteId} planoId={view.planoId} data={data} setData={setData} nav={setView} />}
          {view.page === "produtos" && <ProdutosView  data={data} setData={setData} nav={setView} />}
          {view.page === "produto"  && <ProdutoDetail prodId={view.prodId} data={data} setData={setData} nav={setView} />}
        </main>
      </div>
    </>
  );
}
