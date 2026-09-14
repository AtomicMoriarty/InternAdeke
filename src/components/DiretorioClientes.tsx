// A tela do diretório: o cadastro do cliente, uma vez só.
//
// Cadastrar aqui e depois marcar em quais áreas ele entra. O que é da empresa
// — CNPJ, contatos, endereço, tags — fica neste lugar e aparece igual em
// Compliance, INPI, Contratos e no resto. O que é de cada área — planos, cards,
// prazos — continua na área.

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Plus, Search, Trash2, Building2, Check, X, UserPlus, Undo2 } from "lucide-react";
import {
  clientesAtivos,
  diretorio,
  clienteNovo,
  salvarCliente,
  jaExiste,
  inativarCliente,
  removerCliente,
  podeRemover,
  presencaDoCliente,
  areasSemOCliente,
  vincularNaArea,
  sincronizarNomes,
  type ClienteDiretorio,
} from "@/lib/diretorioClientes";
import type { DashboardState } from "@/lib/dashboardTypes";
import { MODULO_COLOR, moduloOf } from "@/lib/areas";

type Props = {
  data: DashboardState;
  setData: (updater: (d: DashboardState) => DashboardState) => void;
  /** Cria os planos padrão da área ao vincular. Mora no dashboard. */
  planosDaArea: (areaId: string) => unknown[];
  /** Abre o quadro daquele cliente na área. */
  irParaArea: (areaId: string) => void;
};

export default function DiretorioClientes({ data, setData, planosDaArea, irParaArea }: Props) {
  const [busca, setBusca] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [erro, setErro] = useState("");

  const lista = useMemo(() => {
    const base = mostrarInativos
      ? diretorio(data).sort((a, b) => a.nome.localeCompare(b.nome))
      : clientesAtivos(data);
    const q = busca.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) ||
        (c.documento || "").toLowerCase().includes(q) ||
        (c.tags || []).some((t) => t.toLowerCase().includes(q)),
    );
  }, [data, busca, mostrarInativos]);

  function cadastrar() {
    const nome = novoNome.trim();
    if (!nome) return;
    if (jaExiste(data, nome)) {
      setErro(`Já existe um cliente chamado "${nome}".`);
      return;
    }
    const novo = clienteNovo(nome);
    setData((d) => salvarCliente(d, novo));
    setNovoNome("");
    setErro("");
    setAberto(novo.id);
  }

  function editar(cliente: ClienteDiretorio, patch: Partial<ClienteDiretorio>) {
    // Renomear muda o nome em todas as áreas de uma vez: é o ponto do diretório.
    setData((d) => sincronizarNomes(salvarCliente(d, { ...cliente, ...patch })));
  }

  return (
    <div style={{ fontFamily: "Outfit, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ background: "#0DD3C518", borderRadius: 10, padding: 10 }}>
          <Building2 size={20} color="#0DD3C5" />
        </div>
        <div>
          <h2 style={{ color: "#0F172A", fontSize: 20, fontWeight: 900 }}>Clientes</h2>
          <p style={{ color: "#64748B", fontSize: 12 }}>
            O cadastro fica aqui, uma vez só, e serve para todas as áreas.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "14px 0" }}>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 360 }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 11,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#94A3B8",
            }}
          />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, CNPJ ou tag..."
            style={{ ...campo, width: "100%", paddingLeft: 32 }}
          />
        </div>
        <input
          value={novoNome}
          onChange={(e) => {
            setNovoNome(e.target.value);
            setErro("");
          }}
          onKeyDown={(e) => e.key === "Enter" && cadastrar()}
          placeholder="Nome do novo cliente"
          style={{ ...campo, flex: "1 1 220px", maxWidth: 300 }}
        />
        <button onClick={cadastrar} disabled={!novoNome.trim()} style={botaoPrincipal}>
          <Plus size={14} /> Cadastrar
        </button>
        <button
          onClick={() => setMostrarInativos((v) => !v)}
          style={{ ...botaoMini, marginLeft: "auto" }}
        >
          {mostrarInativos ? "Ocultar inativos" : "Mostrar inativos"}
        </button>
      </div>

      {erro && (
        <p style={{ fontSize: 12, color: "#B91C1C", marginBottom: 12 }}>
          {erro} Procure na busca acima em vez de cadastrar de novo.
        </p>
      )}

      {lista.length === 0 && (
        <div
          style={{
            background: "#F8FAFC",
            border: "1px dashed #CBD5E1",
            borderRadius: 12,
            padding: 20,
            fontSize: 12,
            color: "#64748B",
            lineHeight: 1.6,
          }}
        >
          {busca ? (
            <>Nenhum cliente encontrado para &quot;{busca}&quot;.</>
          ) : (
            <>
              <strong style={{ color: "#0F172A" }}>Nenhum cliente cadastrado.</strong> Cadastre aqui
              uma vez e depois marque em quais áreas ele entra - os dados da empresa não precisam
              ser digitados de novo em cada uma.
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {lista.map((c) => (
          <Ficha
            key={c.id}
            cliente={c}
            data={data}
            aberto={aberto === c.id}
            onAbrir={() => setAberto(aberto === c.id ? null : c.id)}
            onEditar={(patch) => editar(c, patch)}
            onVincular={(areaId) =>
              setData((d) => vincularNaArea(d, areaId, c.id, planosDaArea(areaId) as never))
            }
            onInativar={(v) => setData((d) => inativarCliente(d, c.id, v))}
            onRemover={() => setData((d) => removerCliente(d, c.id))}
            irParaArea={irParaArea}
          />
        ))}
      </div>
    </div>
  );
}

function Ficha({
  cliente,
  data,
  aberto,
  onAbrir,
  onEditar,
  onVincular,
  onInativar,
  onRemover,
  irParaArea,
}: {
  cliente: ClienteDiretorio;
  data: DashboardState;
  aberto: boolean;
  onAbrir: () => void;
  onEditar: (patch: Partial<ClienteDiretorio>) => void;
  onVincular: (areaId: string) => void;
  onInativar: (v: boolean) => void;
  onRemover: () => void;
  irParaArea: (areaId: string) => void;
}) {
  const [novaTag, setNovaTag] = useState("");
  const [novoContato, setNovoContato] = useState({ nome: "", cargo: "", telefone: "", email: "" });
  const presenca = presencaDoCliente(data, cliente.id);
  const faltando = areasSemOCliente(data, cliente.id);
  const semTrabalho = podeRemover(data, cliente.id);

  return (
    <div style={{ ...caixa, opacity: cliente.inativo ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onAbrir} style={{ ...semEstilo, flex: 1, textAlign: "left" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>{cliente.nome}</span>
            {cliente.documento && (
              <span style={{ fontSize: 11, color: "#94A3B8" }}>{cliente.documento}</span>
            )}
            {cliente.inativo && <span style={etiquetaCinza}>inativo</span>}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              marginTop: 5,
              flexWrap: "wrap",
            }}
          >
            {presenca.length === 0 ? (
              <span style={{ fontSize: 11, color: "#94A3B8" }}>ainda não está em nenhuma área</span>
            ) : (
              presenca.map((p) => {
                const cor = MODULO_COLOR[moduloOf(p.areaId)] || "#64748B";
                return (
                  <span key={p.areaId} style={{ ...etiqueta, color: cor, background: `${cor}15` }}>
                    {p.areaNome} · {p.itens} card{p.itens !== 1 ? "s" : ""}
                  </span>
                );
              })
            )}
          </div>
        </button>
        <span style={{ fontSize: 10, color: "#CBD5E1" }}>{aberto ? "recolher" : "abrir"}</span>
      </div>

      {aberto && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F1F5F9" }}>
          <Rotulo>Dados da empresa - valem em todas as áreas</Rotulo>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(180px, 1fr))",
              gap: 8,
            }}
          >
            <Campo rotulo="Nome">
              <input
                value={cliente.nome}
                onChange={(e) => onEditar({ nome: e.target.value })}
                style={{ ...campo, width: "100%" }}
              />
            </Campo>
            <Campo rotulo="CNPJ / CPF">
              <input
                value={cliente.documento || ""}
                onChange={(e) => onEditar({ documento: e.target.value })}
                style={{ ...campo, width: "100%" }}
              />
            </Campo>
            <Campo rotulo="E-mail">
              <input
                value={cliente.email || ""}
                onChange={(e) => onEditar({ email: e.target.value })}
                style={{ ...campo, width: "100%" }}
              />
            </Campo>
            <Campo rotulo="Telefone">
              <input
                value={cliente.telefone || ""}
                onChange={(e) => onEditar({ telefone: e.target.value })}
                style={{ ...campo, width: "100%" }}
              />
            </Campo>
            <Campo rotulo="Endereço">
              <input
                value={cliente.endereco || ""}
                onChange={(e) => onEditar({ endereco: e.target.value })}
                style={{ ...campo, width: "100%" }}
              />
            </Campo>
            <Campo rotulo="Contato principal">
              <input
                value={cliente.contato || ""}
                onChange={(e) => onEditar({ contato: e.target.value })}
                style={{ ...campo, width: "100%" }}
              />
            </Campo>
          </div>

          <div style={{ height: 12 }} />
          <Rotulo>Observações</Rotulo>
          <textarea
            value={cliente.descricao || ""}
            onChange={(e) => onEditar({ descricao: e.target.value })}
            placeholder="Contexto, combinados, o que o time precisa saber antes de falar com eles..."
            rows={2}
            style={{ ...campo, width: "100%", resize: "vertical", lineHeight: 1.5 }}
          />

          <div style={{ height: 12 }} />
          <Rotulo>Tags</Rotulo>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {(cliente.tags || []).map((t) => (
              <span key={t} style={{ ...etiqueta, display: "inline-flex", gap: 5 }}>
                {t}
                <button
                  onClick={() => onEditar({ tags: (cliente.tags || []).filter((x) => x !== t) })}
                  style={{ ...semEstilo, color: "#94A3B8" }}
                  title="Remover tag"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            <input
              value={novaTag}
              onChange={(e) => setNovaTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !novaTag.trim()) return;
                const t = novaTag.trim();
                if (!(cliente.tags || []).includes(t))
                  onEditar({ tags: [...(cliente.tags || []), t] });
                setNovaTag("");
              }}
              placeholder="nova tag + Enter"
              style={{ ...campo, width: 150, fontSize: 11 }}
            />
          </div>

          <div style={{ height: 12 }} />
          <Rotulo>Contatos na empresa</Rotulo>
          {(cliente.contatos || []).map((ct) => (
            <div
              key={ct.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 0",
                borderBottom: "1px solid #F8FAFC",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{ct.nome}</div>
                {ct.cargo && <div style={{ fontSize: 10, color: "#94A3B8" }}>{ct.cargo}</div>}
              </div>
              <span style={{ fontSize: 11, color: "#64748B" }}>
                {[ct.telefone, ct.email].filter(Boolean).join(" · ")}
              </span>
              <button
                onClick={() =>
                  onEditar({ contatos: (cliente.contatos || []).filter((x) => x.id !== ct.id) })
                }
                style={{ ...semEstilo, color: "#CBD5E1" }}
                title="Remover contato"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {(["nome", "cargo", "telefone", "email"] as const).map((k) => (
              <input
                key={k}
                value={novoContato[k]}
                onChange={(e) => setNovoContato((c) => ({ ...c, [k]: e.target.value }))}
                placeholder={k === "email" ? "E-mail" : k[0].toUpperCase() + k.slice(1)}
                style={{ ...campo, flex: 1, minWidth: 110, fontSize: 11 }}
              />
            ))}
            <button
              onClick={() => {
                if (!novoContato.nome.trim()) return;
                onEditar({
                  contatos: [
                    ...(cliente.contatos || []),
                    { id: `ct${Math.random().toString(36).slice(2, 9)}`, ...novoContato },
                  ],
                });
                setNovoContato({ nome: "", cargo: "", telefone: "", email: "" });
              }}
              style={botaoMini}
            >
              <UserPlus size={12} />
            </button>
          </div>

          <div style={{ height: 14 }} />
          <Rotulo>Onde este cliente trabalha</Rotulo>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {presenca.map((p) => (
              <button
                key={p.areaId}
                onClick={() => irParaArea(p.areaId)}
                title={`Abrir o quadro em ${p.areaNome}`}
                style={{ ...botaoMini, background: "#F0FDFA", borderColor: "#99F6E4" }}
              >
                <Check size={11} /> {p.areaNome}
              </button>
            ))}
            {faltando.map((a) => (
              <button
                key={a.id}
                onClick={() => onVincular(a.id)}
                title={`Começar a atender este cliente em ${a.name}`}
                style={botaoMini}
              >
                <Plus size={11} /> {a.name}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 10, color: "#94A3B8", marginTop: 6 }}>
            Adicionar a uma área cria o quadro dele lá, já com os planos padrão. Os dados acima não
            precisam ser digitados de novo.
          </p>

          <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
            {cliente.inativo ? (
              <button onClick={() => onInativar(false)} style={{ ...botaoMini, color: "#0891B2" }}>
                <Undo2 size={12} /> Reativar
              </button>
            ) : (
              <button onClick={() => onInativar(true)} style={botaoMini}>
                Marcar como inativo
              </button>
            )}
            <button
              onClick={() => {
                if (confirm(`Remover "${cliente.nome}" do diretório? Isto não tem volta.`)) {
                  onRemover();
                }
              }}
              disabled={!semTrabalho}
              title={
                semTrabalho
                  ? "Remover do diretório"
                  : "Não dá para remover: este cliente tem quadro em alguma área. Marque como inativo."
              }
              style={{
                ...botaoMini,
                color: semTrabalho ? "#DC2626" : "#CBD5E1",
                cursor: semTrabalho ? "pointer" : "not-allowed",
              }}
            >
              <Trash2 size={12} /> Remover
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 800,
        color: "#94A3B8",
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 9, fontWeight: 800, color: "#94A3B8", letterSpacing: 0.5 }}>
        {rotulo.toUpperCase()}
      </span>
      {children}
    </label>
  );
}

const caixa: CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 12,
  padding: 14,
};
const campo: CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  color: "#0F172A",
  fontFamily: "inherit",
  outline: "none",
};
const botaoPrincipal: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "#0DD3C5",
  border: "none",
  borderRadius: 9,
  padding: "8px 14px",
  color: "#fff",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};
const botaoMini: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: "5px 10px",
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
  cursor: "pointer",
  fontFamily: "inherit",
};
const etiqueta: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#0F766E",
  background: "#F0FDFA",
  borderRadius: 20,
  padding: "3px 9px",
  alignItems: "center",
};
const etiquetaCinza: CSSProperties = {
  ...etiqueta,
  color: "#64748B",
  background: "#F1F5F9",
};
const semEstilo: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: "inherit",
};
