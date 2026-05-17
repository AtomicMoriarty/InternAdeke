// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import {
  X, Check, Plus, Calendar, Users, Paperclip, Tag,
  ChevronDown, Maximize2, Eye, MoreHorizontal,
} from "lucide-react";
import { useDashboardState } from "@/lib/useDashboardState";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useProfiles, initials, colorFor } from "@/lib/profiles";
import {
  emitNotifications, emitAtribuicao, emitMudancaStatus,
  type NotifContext,
} from "@/lib/notifications";
import ResponsaveisPicker from "@/components/ResponsaveisPicker";
import MentionTextarea, { MentionText, extractMentions } from "@/components/MentionTextarea";

const KANBAN_COLUMNS = [
  "A Fazer", "Em Andamento", "Pendência Interna",
  "Pendência Cliente", "Monitoramento", "Finalizado", "Suspenso",
] as const;
type KanbanStatus = typeof KANBAN_COLUMNS[number];

const STATUS_COLORS: Record<string, string> = {
  "A Fazer": "#64748B",
  "Em Andamento": "#3B82F6",
  "Pendência Interna": "#F59E0B",
  "Pendência Cliente": "#F97316",
  "Monitoramento": "#06B6D4",
  "Finalizado": "#10B981",
  "Suspenso": "#94A3B8",
};

const ETIQUETA_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#10B981",
  "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899", "#0DD3C5", "#64748B",
];

function uid() { return `_${Math.random().toString(36).slice(2, 9)}`; }
function todayBR() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function moduloOf(areaId: string) {
  return areaId === "lgpd" ? "LGPD" : "Compliance";
}
function timeAgo(iso: string) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

type Props = {
  areaId: string;
  clienteId: string;
  planoId: string;
  itemId: string;
  onClose: () => void;
};

export default function ItemModal({ areaId, clienteId, planoId, itemId, onClose }: Props) {
  const { data, update } = useDashboardState();
  const currentUser = useCurrentUser();
  const profiles = useProfiles();
  const currentProfile = currentUser ? profiles.find((p) => p.id === currentUser.id) : null;

  const [commentDraft, setCommentDraft] = useState("");
  const [newEtiquetaLabel, setNewEtiquetaLabel] = useState("");
  const [newEtiquetaColor, setNewEtiquetaColor] = useState(ETIQUETA_COLORS[0]);
  const [showEtiquetaForm, setShowEtiquetaForm] = useState(false);
  const [newCheckItem, setNewCheckItem] = useState("");
  const [showCheckForm, setShowCheckForm] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showMembros, setShowMembros] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false);
      }
    }
    if (showStatusMenu) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showStatusMenu]);

  if (!data) return null;
  const area = data.areas?.find((a: any) => a.id === areaId);
  const cliente = area?.clientes?.find((c: any) => c.id === clienteId);
  const plano = cliente?.planos?.find((p: any) => p.id === planoId);
  const item = plano?.items?.find((it: any) => it.id === itemId);
  if (!item || !plano || !cliente || !area) return null;

  const modulo = moduloOf(areaId);
  const kanbanStatus: KanbanStatus = item.kanbanStatus || "A Fazer";
  const statusColor = STATUS_COLORS[kanbanStatus] || "#64748B";
  const checklist: any[] = item.checklist || [];
  const checkDone = checklist.filter((ck) => ck.done).length;
  const checkPct = checklist.length ? Math.round((checkDone / checklist.length) * 100) : 0;
  const allActivity: any[] = (item.comentarios || [])
    .slice()
    .sort((a: any, b: any) => (a.created_at || "").localeCompare(b.created_at || ""));

  const ctx: NotifContext = {
    cliente_id: clienteId, cliente_nome: cliente.name,
    modulo, plano_id: planoId, plano_nome: plano.name,
    item_id: itemId, item_nome: item.name,
    autor_id: currentUser?.id || null,
    autor_nome: currentProfile?.display_name || currentUser?.email || "sistema",
    trecho: "",
  };

  function patchItem(patch: any) {
    update((prev: any) => ({
      ...prev,
      areas: prev.areas.map((a: any) => a.id !== areaId ? a : {
        ...a,
        clientes: a.clientes.map((c: any) => c.id !== clienteId ? c : {
          ...c,
          planos: c.planos.map((p: any) => p.id !== planoId ? p : {
            ...p,
            items: p.items.map((it: any) => it.id !== itemId ? it : { ...it, ...patch }),
          }),
        }),
      }),
    }));
  }

  function changeStatus(s: KanbanStatus) {
    patchItem({ kanbanStatus: s });
    setShowStatusMenu(false);
    emitMudancaStatus({
      responsibleIds: item.responsaveis || [],
      novoStatus: s,
      ctx: { ...ctx, trecho: `Status alterado para "${s}"` },
    });
  }

  function changeResponsaveis(ids: string[]) {
    const old = item.responsaveis || [];
    patchItem({ responsaveis: ids });
    emitAtribuicao({ newIds: ids, oldIds: old, ctx: { ...ctx, trecho: "foi atribuído(a) ao item" } });
    setShowMembros(false);
  }

  function addComment() {
    const txt = commentDraft.trim();
    if (!txt) return;
    const meName = currentProfile?.display_name || "Usuário";
    const entry = {
      id: `cm${uid()}`, tipo: "comentario",
      date: todayBR(), created_at: new Date().toISOString(),
      text: txt, autor_id: currentUser?.id || null, autor_nome: meName,
    };
    patchItem({ comentarios: [...(item.comentarios || []), entry] });
    setCommentDraft("");
    if (currentUser) {
      const mentioned = extractMentions(txt, profiles).map((p) => p.id);
      emitNotifications({ ctx: { ...ctx, trecho: txt }, mentionedIds: mentioned, responsibleIds: item.responsaveis || [] });
    }
  }

  function addCheckItem() {
    const txt = newCheckItem.trim();
    if (!txt) return;
    patchItem({ checklist: [...checklist, { id: `ck${uid()}`, text: txt, done: false }] });
    setNewCheckItem("");
  }

  function toggleCheck(id: string) {
    patchItem({ checklist: checklist.map((ck) => ck.id !== id ? ck : { ...ck, done: !ck.done }) });
  }

  function deleteCheck(id: string) {
    patchItem({ checklist: checklist.filter((ck) => ck.id !== id) });
  }

  function addEtiqueta() {
    if (!newEtiquetaLabel.trim()) return;
    patchItem({ etiquetas: [...(item.etiquetas || []), { id: `et${uid()}`, label: newEtiquetaLabel.trim(), color: newEtiquetaColor }] });
    setNewEtiquetaLabel("");
    setShowEtiquetaForm(false);
  }

  function removeEtiqueta(id: string) {
    patchItem({ etiquetas: (item.etiquetas || []).filter((e: any) => e.id !== id) });
  }

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 2000,
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "48px 20px 20px", overflowY: "auto", fontFamily: "Outfit, sans-serif",
      }}
    >
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 880,
        boxShadow: "0 24px 80px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
              {plano.name}
            </div>
            <input
              value={item.name}
              onChange={(e) => patchItem({ name: e.target.value })}
              style={{
                width: "100%", background: "none", border: "none", outline: "none",
                fontSize: 20, fontWeight: 900, color: "#0F172A", fontFamily: "inherit", padding: 0,
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0, paddingTop: 4 }}>
            <button title="Maximizar" style={iconBtn}><Maximize2 size={15} color="#94A3B8" /></button>
            <button title="Visualizar" style={iconBtn}><Eye size={15} color="#94A3B8" /></button>
            <button title="Opções" style={iconBtn}><MoreHorizontal size={15} color="#94A3B8" /></button>
            <button onClick={onClose} style={{ ...iconBtn, marginLeft: 4 }} title="Fechar"><X size={17} color="#475569" /></button>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: "flex", minHeight: 480 }}>
          {/* ── Left column ── */}
          <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto", borderRight: "1px solid #F1F5F9" }}>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 22 }}>
              <ActionBtn icon={<Plus size={12} />} label="Adicionar" onClick={() => {}} />
              <ActionBtn icon={<Calendar size={12} />} label="Datas" onClick={() => {}} active={!!item.prazo} />
              <ActionBtn icon={<Check size={12} />} label="Checklist" onClick={() => setShowCheckForm(true)} active={checklist.length > 0} />
              <div style={{ position: "relative" }}>
                <ActionBtn icon={<Users size={12} />} label="Membros" onClick={() => setShowMembros((o) => !o)} active={(item.responsaveis || []).length > 0} />
                {showMembros && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 300 }}>
                    <ResponsaveisPicker value={item.responsaveis || []} onChange={changeResponsaveis} />
                  </div>
                )}
              </div>
              <ActionBtn icon={<Paperclip size={12} />} label="Anexo" onClick={() => {}} />
            </div>

            {/* Status + Prazo */}
            <div style={{ display: "flex", gap: 16, marginBottom: 22, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div ref={statusMenuRef} style={{ position: "relative" }}>
                <Label>Status</Label>
                <button onClick={() => setShowStatusMenu((o) => !o)} style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "7px 12px",
                  background: `${statusColor}15`, border: `1.5px solid ${statusColor}50`,
                  borderRadius: 8, color: statusColor, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                  {kanbanStatus} <ChevronDown size={12} />
                </button>
                {showStatusMenu && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
                    background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10,
                    boxShadow: "0 8px 30px rgba(0,0,0,0.14)", minWidth: 210, overflow: "hidden",
                  }}>
                    {KANBAN_COLUMNS.map((s) => {
                      const sc = STATUS_COLORS[s];
                      return (
                        <button key={s} onClick={() => changeStatus(s)} style={{
                          display: "flex", alignItems: "center", gap: 9, width: "100%",
                          padding: "9px 14px", background: s === kanbanStatus ? `${sc}12` : "transparent",
                          border: "none", color: sc, fontSize: 12, fontWeight: 600,
                          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                        }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: sc, flexShrink: 0 }} />
                          {s}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <Label>Prazo</Label>
                <input
                  value={item.prazo || ""}
                  onChange={(e) => patchItem({ prazo: e.target.value })}
                  placeholder="DD/MM/AAAA"
                  style={fieldStyle}
                />
              </div>

              {(item.responsaveis || []).length > 0 && (
                <div>
                  <Label>Responsáveis</Label>
                  <div style={{ display: "inline-flex", paddingTop: 2 }}>
                    {(item.responsaveis || []).map((id: string, i: number) => {
                      const p = profiles.find((x) => x.id === id);
                      if (!p) return null;
                      return (
                        <span key={id} title={p.display_name} style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 30, height: 30, borderRadius: "50%", background: p.avatar_color || colorFor(p.id),
                          color: "#fff", fontSize: 10, fontWeight: 800, marginLeft: i === 0 ? 0 : -8, border: "2px solid #fff",
                        }}>{initials(p.display_name)}</span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Etiquetas */}
            <div style={{ marginBottom: 22 }}>
              <Label>Etiquetas</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 6 }}>
                {(item.etiquetas || []).map((et: any) => (
                  <span key={et.id} style={{
                    display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px",
                    borderRadius: 20, fontSize: 11, fontWeight: 700,
                    background: `${et.color}20`, color: et.color, border: `1px solid ${et.color}40`,
                  }}>
                    {et.label}
                    <button onClick={() => removeEtiqueta(et.id)} style={{ background: "none", border: "none", cursor: "pointer", color: et.color, padding: 0, lineHeight: 1, display: "flex" }}>
                      <X size={10} />
                    </button>
                  </span>
                ))}
                <button onClick={() => setShowEtiquetaForm((o) => !o)} style={{
                  display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px",
                  borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#F1F5F9",
                  border: "1px solid #E2E8F0", color: "#64748B", cursor: "pointer", fontFamily: "inherit",
                }}>
                  <Plus size={10} /> Etiqueta
                </button>
              </div>
              {showEtiquetaForm && (
                <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    autoFocus value={newEtiquetaLabel} onChange={(e) => setNewEtiquetaLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addEtiqueta()}
                    placeholder="Nome da etiqueta..."
                    style={fieldStyle}
                  />
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {ETIQUETA_COLORS.map((c) => (
                      <button key={c} onClick={() => setNewEtiquetaColor(c)} style={{
                        width: 20, height: 20, borderRadius: 6, background: c,
                        border: c === newEtiquetaColor ? "2.5px solid #0F172A" : "2px solid transparent", cursor: "pointer",
                      }} />
                    ))}
                  </div>
                  <button onClick={addEtiqueta} style={primaryBtn}>Adicionar</button>
                </div>
              )}
            </div>

            {/* Descrição */}
            <div style={{ marginBottom: 22 }}>
              <Label>Descrição</Label>
              <textarea
                value={item.descricao || ""}
                onChange={(e) => patchItem({ descricao: e.target.value })}
                placeholder="Adicione uma descrição detalhada..."
                rows={3}
                style={{
                  marginTop: 6, width: "100%", background: "#F8FAFC", border: "1px solid #E2E8F0",
                  borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: "inherit",
                  color: "#0F172A", resize: "vertical", outline: "none", lineHeight: 1.6,
                }}
              />
            </div>

            {/* Checklist */}
            {(checklist.length > 0 || showCheckForm) && (
              <div style={{ marginBottom: 22 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <Label>Checklist {checklist.length > 0 && <span style={{ color: "#0DD3C5", marginLeft: 4 }}>{checkPct}%</span>}</Label>
                  {checklist.length > 0 && <span style={{ fontSize: 11, color: "#64748B" }}>{checkDone}/{checklist.length}</span>}
                </div>
                {checklist.length > 0 && (
                  <div style={{ height: 4, background: "#E2E8F0", borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
                    <div style={{ width: `${checkPct}%`, height: "100%", background: "#0DD3C5", borderRadius: 2, transition: "width 0.3s" }} />
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
                  {checklist.map((ck: any) => (
                    <div key={ck.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                      <button onClick={() => toggleCheck(ck.id)} style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: "pointer",
                        border: `2px solid ${ck.done ? "#0DD3C5" : "#CBD5E1"}`,
                        background: ck.done ? "#0DD3C5" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {ck.done && <Check size={11} color="#fff" />}
                      </button>
                      <input
                        value={ck.text}
                        onChange={(e) => patchItem({ checklist: checklist.map((c: any) => c.id !== ck.id ? c : { ...c, text: e.target.value }) })}
                        style={{
                          flex: 1, background: "none", border: "none", outline: "none", fontSize: 13,
                          fontFamily: "inherit", color: ck.done ? "#94A3B8" : "#0F172A",
                          textDecoration: ck.done ? "line-through" : "none",
                        }}
                      />
                      <button onClick={() => deleteCheck(ck.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#CBD5E1", padding: 2, display: "flex" }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                {showCheckForm ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      autoFocus value={newCheckItem} onChange={(e) => setNewCheckItem(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") addCheckItem(); if (e.key === "Escape") setShowCheckForm(false); }}
                      placeholder="Novo item..."
                      style={fieldStyle}
                    />
                    <button onClick={addCheckItem} style={primaryBtn}><Plus size={13} /></button>
                    <button onClick={() => setShowCheckForm(false)} style={ghostBtn}><X size={13} /></button>
                  </div>
                ) : (
                  <button onClick={() => setShowCheckForm(true)} style={{
                    display: "inline-flex", alignItems: "center", gap: 5, background: "none",
                    border: "none", color: "#94A3B8", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                  }}>
                    <Plus size={12} /> Adicionar item
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Right column — atividade ── */}
          <div style={{ width: 284, padding: "20px 18px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", background: "#FAFBFC", borderRadius: "0 0 16px 0" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.7 }}>Atividade</div>

            {/* Comment input */}
            <div>
              <MentionTextarea
                value={commentDraft}
                onChange={setCommentDraft}
                onSubmit={addComment}
                placeholder="Escrever um comentário... use @ para mencionar"
                rows={3}
              />
              {commentDraft.trim() && (
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <button onClick={addComment} style={primaryBtn}>Salvar</button>
                  <button onClick={() => setCommentDraft("")} style={ghostBtn}>Cancelar</button>
                </div>
              )}
            </div>

            {/* Activity list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {allActivity.length === 0 && (
                <p style={{ fontSize: 12, color: "#CBD5E1", fontStyle: "italic" }}>Sem atividade ainda.</p>
              )}
              {allActivity.map((c: any) => {
                const p = profiles.find((x) => x.id === c.autor_id);
                const avatarColor = p ? (p.avatar_color || colorFor(p.id)) : "#64748B";
                const name = c.autor_nome || "Usuário";
                return (
                  <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 26, height: 26, borderRadius: "50%", background: avatarColor,
                      color: "#fff", fontSize: 9, fontWeight: 800, flexShrink: 0,
                    }}>
                      {p ? initials(p.display_name) : name.slice(0, 2).toUpperCase()}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 3, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{name}</span>
                        <span style={{ fontSize: 10, color: "#94A3B8" }}>{c.created_at ? timeAgo(c.created_at) : c.date}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#475569", background: "#fff", padding: "7px 10px", borderRadius: 8, lineHeight: 1.5, border: "1px solid #F1F5F9" }}>
                        <MentionText text={c.text} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.7 }}>
      {children}
    </div>
  );
}

function ActionBtn({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px",
      borderRadius: 8, border: `1px solid ${active ? "#0DD3C580" : "#E2E8F0"}`,
      background: active ? "#F0FDFA" : "#F8FAFC",
      color: active ? "#0F766E" : "#475569",
      fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    }}>
      {icon} {label}
    </button>
  );
}

const iconBtn: any = {
  background: "none", border: "none", cursor: "pointer",
  padding: 6, borderRadius: 6, display: "flex", alignItems: "center",
};
const fieldStyle: any = {
  background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8,
  padding: "7px 10px", fontSize: 12, fontFamily: "inherit", outline: "none",
  color: "#0F172A", width: 160,
};
const primaryBtn: any = {
  background: "#0DD3C5", border: "none", borderRadius: 8, padding: "7px 14px",
  color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  display: "inline-flex", alignItems: "center", gap: 4,
};
const ghostBtn: any = {
  background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 8, padding: "7px 10px",
  fontSize: 12, color: "#64748B", cursor: "pointer", fontFamily: "inherit",
  display: "inline-flex", alignItems: "center",
};
