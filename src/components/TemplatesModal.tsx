// @ts-nocheck
import { useState } from "react";
import { X, Plus, Trash2, Copy, Save } from "lucide-react";
import { useProfiles, initials, colorFor } from "@/lib/profiles";
import ResponsaveisPicker from "@/components/ResponsaveisPicker";
import { AREAS } from "@/lib/areas";
import { templateVazio, resumirTemplate, TIPOS_PADRAO } from "@/lib/templates";

const CORES_ETIQUETA = [
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#10B981",
  "#06B6D4",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#0DD3C5",
  "#64748B",
];

/**
 * Editor de templates.
 *
 * Trabalha sobre uma cópia local e só grava ao salvar — assim dá para mexer sem
 * medo, e um fechamento acidental não deixa meio template salvo.
 */
export default function TemplatesModal({ templates, areaIdPadrao, onSalvar, onFechar }) {
  const profiles = useProfiles();
  const [lista, setLista] = useState(() => templates.map((t) => ({ ...t })));
  const [selecionadoId, setSelecionadoId] = useState(lista[0]?.id || null);
  const [sujo, setSujo] = useState(false);

  const atual = lista.find((t) => t.id === selecionadoId) || null;

  function alterar(campo, valor) {
    setLista((l) => l.map((t) => (t.id === selecionadoId ? { ...t, [campo]: valor } : t)));
    setSujo(true);
  }

  function novo() {
    const t = { ...templateVazio(areaIdPadrao), nome: "Novo template" };
    setLista((l) => [...l, t]);
    setSelecionadoId(t.id);
    setSujo(true);
  }

  function duplicar() {
    if (!atual) return;
    const t = {
      ...atual,
      id: `tpl_${Math.random().toString(36).slice(2, 9)}`,
      nome: `${atual.nome} (cópia)`,
    };
    setLista((l) => [...l, t]);
    setSelecionadoId(t.id);
    setSujo(true);
  }

  function apagar() {
    if (!atual) return;
    if (!confirm(`Apagar o template "${atual.nome}"? Os cards já criados não são afetados.`))
      return;
    setLista((l) => l.filter((t) => t.id !== selecionadoId));
    setSelecionadoId(null);
    setSujo(true);
  }

  function fechar() {
    if (sujo && !confirm("Sair sem salvar? As alterações nos templates serão perdidas.")) return;
    onFechar();
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && fechar()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.6)",
        zIndex: 2100,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 20px 20px",
        overflowY: "auto",
        fontFamily: "Outfit, sans-serif",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 860,
          boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Cabeçalho */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #F1F5F9",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 17, fontWeight: 900, color: "#0F172A" }}>Templates de card</h3>
            <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
              O que o template preenche vale na criação. Alterar um template não mexe nos cards já
              criados.
            </p>
          </div>
          <button onClick={fechar} style={iconBtn}>
            <X size={18} color="#475569" />
          </button>
        </div>

        <div style={{ display: "flex", minHeight: 420 }}>
          {/* Lista */}
          <div
            style={{
              width: 250,
              borderRight: "1px solid #F1F5F9",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ padding: 8 }}>
              <button
                onClick={novo}
                style={{ ...btnPrim, width: "100%", justifyContent: "center" }}
              >
                <Plus size={13} /> Novo template
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
              {lista.length === 0 && (
                <p style={{ fontSize: 11.5, color: "#94A3B8", padding: 12, lineHeight: 1.6 }}>
                  Nenhum template. Crie um para acelerar a abertura de demandas repetidas.
                </p>
              )}
              {lista.map((t) => {
                const area = AREAS.find((a) => a.id === t.areaId);
                const on = t.id === selecionadoId;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelecionadoId(t.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      marginBottom: 3,
                      padding: "8px 10px",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      background: on ? "#F0FDFA" : "transparent",
                      border: `1px solid ${on ? "#0DD3C5" : "transparent"}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#0F172A",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.nome || "(sem nome)"}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#94A3B8",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {area ? area.modulo : "Todos os quadros"}
                      {resumirTemplate(t) ? ` · ${resumirTemplate(t)}` : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Editor */}
          <div style={{ flex: 1, padding: 18, overflowY: "auto" }}>
            {!atual ? (
              <p style={{ fontSize: 12, color: "#94A3B8", padding: 20, textAlign: "center" }}>
                Escolha um template à esquerda, ou crie um novo.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <Rot>Nome</Rot>
                  <input
                    value={atual.nome}
                    onChange={(e) => alterar("nome", e.target.value)}
                    placeholder="Ex: Resposta a exigência"
                    style={{ ...campo, width: "100%", fontSize: 13, fontWeight: 700 }}
                  />
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <Rot>Quadro</Rot>
                    <select
                      value={atual.areaId}
                      onChange={(e) => alterar("areaId", e.target.value)}
                      style={{ ...campo, width: 175, cursor: "pointer" }}
                    >
                      <option value="">Todos os quadros</option>
                      {AREAS.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Rot>Tipo</Rot>
                    <select
                      value={atual.tipo}
                      onChange={(e) => alterar("tipo", e.target.value)}
                      style={{ ...campo, width: 150, cursor: "pointer" }}
                    >
                      {TIPOS_PADRAO.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Rot>Prazo</Rot>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <input
                        type="number"
                        min={0}
                        value={atual.prazoDias ?? ""}
                        onChange={(e) =>
                          alterar(
                            "prazoDias",
                            e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                          )
                        }
                        placeholder="-"
                        style={{ ...campo, width: 72 }}
                      />
                      <span style={{ fontSize: 11, color: "#94A3B8" }}>dias após criar</span>
                    </div>
                  </div>
                </div>

                <div>
                  <Rot>Responsáveis padrão</Rot>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <ResponsaveisPicker
                      value={atual.responsaveis || []}
                      onChange={(ids) => alterar("responsaveis", ids)}
                    />
                    <span style={{ fontSize: 10.5, color: "#94A3B8" }}>
                      quem criar o card entra junto
                    </span>
                  </div>
                </div>

                <div>
                  <Rot>Checklist</Rot>
                  <ListaTexto
                    itens={atual.checklist || []}
                    onChange={(v) => alterar("checklist", v)}
                    placeholder="Etapa do checklist"
                  />
                </div>

                <div>
                  <Rot>Etiquetas</Rot>
                  <Etiquetas
                    itens={atual.etiquetas || []}
                    onChange={(v) => alterar("etiquetas", v)}
                  />
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={!!atual.acompanhamentoSemanal}
                    onChange={(e) => alterar("acompanhamentoSemanal", e.target.checked)}
                  />
                  <span style={{ fontSize: 12, color: "#0F172A", fontWeight: 600 }}>
                    Ligar acompanhamento semanal nos cards deste template
                  </span>
                </label>

                <div
                  style={{ display: "flex", gap: 6, paddingTop: 4, borderTop: "1px solid #F1F5F9" }}
                >
                  <button onClick={duplicar} style={btnSec}>
                    <Copy size={12} /> Duplicar
                  </button>
                  <button
                    onClick={apagar}
                    style={{
                      ...btnSec,
                      color: "#DC2626",
                      borderColor: "#FECACA",
                      background: "#FEF2F2",
                    }}
                  >
                    <Trash2 size={12} /> Apagar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Rodapé */}
        <div
          style={{
            padding: 12,
            borderTop: "1px solid #F1F5F9",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            alignItems: "center",
          }}
        >
          {sujo && (
            <span style={{ fontSize: 11, color: "#B45309", marginRight: "auto" }}>
              Alterações não salvas
            </span>
          )}
          <button onClick={fechar} style={btnSec}>
            Cancelar
          </button>
          <button
            onClick={() => {
              onSalvar(lista);
              onFechar();
            }}
            style={btnPrim}
          >
            <Save size={13} /> Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Lista de linhas de texto, para checklist. */
function ListaTexto({ itens, onChange, placeholder }) {
  const [novo, setNovo] = useState("");
  function add() {
    if (!novo.trim()) return;
    onChange([...itens, novo.trim()]);
    setNovo("");
  }
  return (
    <div style={{ marginTop: 4 }}>
      {itens.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 6 }}>
          {itens.map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "#CBD5E1", width: 16, textAlign: "right" }}>
                {i + 1}
              </span>
              <input
                value={t}
                onChange={(e) => onChange(itens.map((x, j) => (j === i ? e.target.value : x)))}
                style={{ ...campo, flex: 1 }}
              />
              <button onClick={() => onChange(itens.filter((_, j) => j !== i))} style={iconBtn}>
                <X size={12} color="#CBD5E1" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 5 }}>
        <input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={placeholder}
          style={{ ...campo, flex: 1 }}
        />
        <button onClick={add} style={btnSec}>
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

function Etiquetas({ itens, onChange }) {
  const [label, setLabel] = useState("");
  const [cor, setCor] = useState(CORES_ETIQUETA[0]);
  function add() {
    if (!label.trim()) return;
    onChange([...itens, { label: label.trim(), color: cor }]);
    setLabel("");
  }
  return (
    <div style={{ marginTop: 4 }}>
      {itens.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
          {itens.map((e, i) => (
            <span
              key={i}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 9px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 700,
                background: `${e.color}20`,
                color: e.color,
                border: `1px solid ${e.color}40`,
              }}
            >
              {e.label}
              <button
                onClick={() => onChange(itens.filter((_, j) => j !== i))}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: e.color,
                  padding: 0,
                  display: "flex",
                }}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Nome da etiqueta"
          style={{ ...campo, width: 150 }}
        />
        <div style={{ display: "flex", gap: 3 }}>
          {CORES_ETIQUETA.map((c) => (
            <button
              key={c}
              onClick={() => setCor(c)}
              style={{
                width: 18,
                height: 18,
                borderRadius: 5,
                background: c,
                cursor: "pointer",
                border: c === cor ? "2.5px solid #0F172A" : "2px solid transparent",
              }}
            />
          ))}
        </div>
        <button onClick={add} style={btnSec}>
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

function Rot({ children }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: "#94A3B8",
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginBottom: 3,
      }}
    >
      {children}
    </div>
  );
}

const campo = {
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 7,
  padding: "6px 9px",
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
  color: "#0F172A",
};
const iconBtn = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 4,
  display: "flex",
  alignItems: "center",
};
const btnPrim = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "#0DD3C5",
  border: "none",
  borderRadius: 8,
  color: "#fff",
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
const btnSec = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  color: "#475569",
  padding: "7px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
