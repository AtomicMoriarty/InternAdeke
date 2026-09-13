// @ts-nocheck
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowLeft,
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  Edit3,
  LayoutGrid,
  MessageSquare,
  Pin,
  Plus,
  Save,
  StickyNote,
  Trash2,
  User,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AREAS } from "@/lib/areas";
import type { DashboardState } from "@/lib/dashboardTypes";
import type { Profile } from "@/lib/profiles";
import type { Session } from "@supabase/supabase-js";
import { DEFAULT_ALLOWED_MODULES } from "@/lib/profiles";

/** Quadros que podem ser liberados por pessoa, mais o pseudo-modulo Produtos. */
const MODULOS_SELECIONAVEIS: [string, string][] = [
  ...AREAS.map((a) => [a.id, a.modulo] as [string, string]),
  ["produtos", "Produtos"],
];
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useDashboardState } from "@/lib/useDashboardState";
import { flattenDashboard, COLUMN_COLORS, type FlatCard } from "@/lib/flattenItems";
import { useNotifications, markRead, type Notification } from "@/lib/notifications";
import { useProfiles } from "@/lib/profiles";

export const Route = createFileRoute("/eu")({
  component: EuPage,
});

const NOTE_COLORS = ["#0DD3C5", "#3B82F6", "#8B5CF6", "#EF4444", "#F97316", "#F59E0B", "#10B981"];

type PersonalNote = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  color: string;
  pinned: boolean;
  updated_at: string;
};

function EuPage() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const profiles = useProfiles();
  const me = currentUser ? profiles.find((p) => p.id === currentUser.id) : null;
  const { data, loaded } = useDashboardState("eu");
  const notifications = useNotifications(currentUser?.id || null);
  const [checked, setChecked] = useState(false);
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftColor, setDraftColor] = useState(NOTE_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notesReady, setNotesReady] = useState(true);
  const [adminProfiles, setAdminProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setChecked(true);
      if (!data.session) navigate({ to: "/auth" });
    });
  }, [navigate]);

  useEffect(() => {
    if (!currentUser?.id) return;
    let active = true;
    async function loadNotes() {
      const { data, error } = await supabase
        .from("personal_notes")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false });
      if (!active) return;
      if (error) {
        setNotesReady(false);
        setNotes([]);
        return;
      }
      setNotesReady(true);
      setNotes((data || []) as PersonalNote[]);
    }
    loadNotes();
    const ch = supabase
      .channel(`personal_notes_${currentUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "personal_notes",
          filter: `user_id=eq.${currentUser.id}`,
        },
        loadNotes,
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [currentUser?.id]);

  const myTasks = useMemo(() => {
    const cards = data ? flattenDashboard(data) : [];
    return cards
      .filter((card) => currentUser?.id && card.responsaveis?.includes(currentUser.id))
      .sort(compareCards);
  }, [data, currentUser?.id]);

  const unread = notifications.filter((n) => !n.lida);
  const updates = notifications.slice(0, 8);
  const isAdmin =
    me?.role === "admin" || currentUser?.email?.toLowerCase() === "portoepacca@portoepacca.com";

  useEffect(() => {
    if (!isAdmin) return;
    loadAdminProfiles();
  }, [isAdmin]);

  async function loadAdminProfiles() {
    const { data } = await supabase.from("profiles").select("*").order("display_name");
    setAdminProfiles(data || []);
  }

  async function patchProfile(id: string, patch: Partial<Profile>) {
    await supabase.from("profiles").update(patch).eq("id", id);
    setAdminProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function toggleModule(profile: Profile, moduleId: string) {
    const current = Array.isArray(profile.allowed_modules)
      ? profile.allowed_modules
      : DEFAULT_ALLOWED_MODULES;
    const next = current.includes(moduleId)
      ? current.filter((id: string) => id !== moduleId)
      : [...current, moduleId];
    patchProfile(profile.id, { allowed_modules: next });
  }

  async function addNote() {
    if (!currentUser?.id || !notesReady) return;
    const title = draftTitle.trim();
    const body = draftBody.trim();
    if (!title && !body) return;
    const { data } = await supabase
      .from("personal_notes")
      .insert({
        user_id: currentUser.id,
        title: title || "Nota sem título",
        body,
        color: draftColor,
      })
      .select("*")
      .single();
    if (data) setNotes((prev) => [data as PersonalNote, ...prev]);
    setDraftTitle("");
    setDraftBody("");
    setDraftColor(NOTE_COLORS[0]);
  }

  async function patchNote(id: string, patch: Partial<PersonalNote>) {
    await supabase
      .from("personal_notes")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", currentUser?.id || "");
    setNotes((prev) =>
      prev.map((note) =>
        note.id === id ? { ...note, ...patch, updated_at: new Date().toISOString() } : note,
      ),
    );
  }

  async function deleteNote(id: string) {
    await supabase
      .from("personal_notes")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser?.id || "");
    setNotes((prev) => prev.filter((note) => note.id !== id));
  }

  if (!checked || !currentUser) {
    return <LoadingScreen />;
  }

  const displayName = me?.display_name || currentUser.email?.split("@")[0] || "Eu";

  return (
    <div style={{ minHeight: "100vh", background: "#F0F5FF", fontFamily: "Outfit, sans-serif" }}>
      <TopBar displayName={displayName} />
      <main
        style={{ padding: "22px", display: "grid", gridTemplateColumns: "1.35fr 0.9fr", gap: 18 }}
      >
        <section style={panelStyle}>
          <SectionTitle
            icon={<User size={16} />}
            title="Minhas tarefas"
            aside={`${myTasks.length} abertas`}
          />
          {!loaded && <EmptyText>Carregando tarefas...</EmptyText>}
          {loaded && myTasks.length === 0 && (
            <EmptyText>Nenhuma tarefa atribuída a você por enquanto.</EmptyText>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {myTasks.map((card) => (
              <TaskRow key={`${card.planoId}-${card.itemId}`} card={card} />
            ))}
          </div>
        </section>

        <section style={panelStyle}>
          <SectionTitle
            icon={<Bell size={16} />}
            title="Atualizações"
            aside={`${unread.length} novas`}
          />
          {updates.length === 0 && <EmptyText>Nenhuma atualização recente.</EmptyText>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {updates.map((n) => (
              <NotificationRow key={n.id} n={n} onRead={() => markRead(n.id)} />
            ))}
          </div>
        </section>

        <section style={{ ...panelStyle, gridColumn: "1 / -1" }}>
          <SectionTitle
            icon={<StickyNote size={16} />}
            title="Minhas anotações privadas"
            aside="só você vê"
          />
          <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
            <div style={{ borderRight: "1px solid #E2E8F0", paddingRight: 16 }}>
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Título"
                style={inputStyle}
              />
              <textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder="Escreva uma anotação pessoal..."
                rows={7}
                style={{ ...inputStyle, resize: "vertical", marginTop: 8, lineHeight: 1.5 }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {NOTE_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setDraftColor(color)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 7,
                      background: color,
                      border: color === draftColor ? "3px solid #0F172A" : "2px solid #fff",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
              <button
                onClick={addNote}
                disabled={!notesReady}
                style={{
                  ...primaryBtn,
                  marginTop: 12,
                  opacity: notesReady ? 1 : 0.55,
                  cursor: notesReady ? "pointer" : "not-allowed",
                }}
              >
                <Plus size={14} /> Adicionar anotação
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 12,
              }}
            >
              {notes.length === 0 && (
                <EmptyText>
                  {notesReady
                    ? "Suas anotações privadas aparecerão aqui."
                    : "As anotações privadas serão ativadas assim que a tabela personal_notes for criada no Supabase."}
                </EmptyText>
              )}
              {notes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  editing={editingId === note.id}
                  onEdit={() => setEditingId(note.id)}
                  onCancel={() => setEditingId(null)}
                  onSave={(patch) => {
                    patchNote(note.id, patch);
                    setEditingId(null);
                  }}
                  onPin={() => patchNote(note.id, { pinned: !note.pinned })}
                  onDelete={() => deleteNote(note.id)}
                />
              ))}
            </div>
          </div>
        </section>

        {isAdmin && (
          <section style={{ ...panelStyle, gridColumn: "1 / -1" }}>
            <SectionTitle
              icon={<User size={16} />}
              title="Admin"
              aside={`${adminProfiles.length} acessos`}
            />
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <a
                href="https://dash.cloudflare.com/125e832d8c6b75032b0309fc281e05f2/workers/services/view/adekeintern/production/observability/logs"
                target="_blank"
                rel="noreferrer"
                style={ghostBtn}
              >
                Logs Cloudflare
              </a>
              <a
                href="https://supabase.com/dashboard/project/nozthsissdwkfwtogmdu/logs/explorer"
                target="_blank"
                rel="noreferrer"
                style={ghostBtn}
              >
                Logs Supabase
              </a>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {adminProfiles.map((profile) => (
                <div
                  key={profile.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto auto",
                    alignItems: "center",
                    gap: 8,
                    padding: 10,
                    border: "1px solid #E2E8F0",
                    borderRadius: 8,
                    background: "#fff",
                  }}
                >
                  <div>
                    <strong style={{ display: "block", fontSize: 12, color: "#0F172A" }}>
                      {profile.display_name}
                    </strong>
                    <span style={{ fontSize: 11, color: "#64748B" }}>{profile.email}</span>
                  </div>
                  <button
                    onClick={() =>
                      patchProfile(profile.id, {
                        role: profile.role === "admin" ? "member" : "admin",
                      })
                    }
                    style={ghostBtn}
                  >
                    {profile.role === "admin" ? "Admin" : "Membro"}
                  </button>
                  <div
                    style={{
                      display: "flex",
                      gap: 5,
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                    }}
                  >
                    {MODULOS_SELECIONAVEIS.map(([id, label]) => {
                      const allowed = (profile.allowed_modules || DEFAULT_ALLOWED_MODULES).includes(
                        id,
                      );
                      return (
                        <button
                          key={id}
                          onClick={() => toggleModule(profile, id)}
                          style={{
                            ...ghostBtn,
                            padding: "6px 8px",
                            color: allowed ? "#047857" : "#DC2626",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() =>
                      patchProfile(profile.id, { access_enabled: !profile.access_enabled })
                    }
                    style={{
                      ...ghostBtn,
                      color: profile.access_enabled ? "#047857" : "#DC2626",
                    }}
                  >
                    {profile.access_enabled ? "Ativo" : "Bloqueado"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function TopBar({ displayName }: { displayName: string }) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 200,
        background: "#0F172A",
        color: "#fff",
        padding: "12px 22px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <Link to="/" style={topLinkStyle}>
        <ArrowLeft size={14} /> Voltar
      </Link>
      <span style={{ fontSize: 14, fontWeight: 900 }}>Eu</span>
      <span style={{ fontSize: 11, opacity: 0.72 }}>{displayName}</span>
      <Link to="/quadro" style={{ ...topLinkStyle, marginLeft: "auto" }}>
        <LayoutGrid size={14} /> Quadro Geral
      </Link>
    </div>
  );
}

function TaskRow({ card }: { card: FlatCard }) {
  const color = COLUMN_COLORS[card.kanbanStatus] || "#64748B";
  return (
    <Link
      to="/"
      search={
        {
          cliente: card.clienteId,
          modulo: card.modulo,
          plano: card.planoId,
          item: card.itemId,
        } as never
      }
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 8,
        padding: 12,
        border: "1px solid #E2E8F0",
        borderLeft: `4px solid ${color}`,
        borderRadius: 8,
        background: "#fff",
        textDecoration: "none",
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>{card.itemNome}</div>
        <div style={{ fontSize: 11, color: "#64748B", marginTop: 3 }}>
          {card.clienteNome} · {card.planoNome}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <span style={{ fontSize: 10, color, fontWeight: 800 }}>{card.kanbanStatus}</span>
        {card.prazo && (
          <div
            style={{
              fontSize: 10,
              color: "#64748B",
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Calendar size={11} /> {formatDate(card.prazo)}
          </div>
        )}
      </div>
    </Link>
  );
}

function NotificationRow({ n, onRead }: { n: Notification; onRead: () => void }) {
  return (
    <button
      onClick={onRead}
      style={{
        display: "flex",
        gap: 10,
        width: "100%",
        padding: 10,
        border: "1px solid #E2E8F0",
        borderRadius: 8,
        background: n.lida ? "#fff" : "#F0FDFA",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <MessageSquare size={14} color={n.lida ? "#94A3B8" : "#0DD3C5"} />
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontSize: 12, color: "#0F172A", fontWeight: 800 }}>
          {n.item_nome || n.plano_nome}
        </span>
        <span style={{ display: "block", fontSize: 11, color: "#64748B", marginTop: 2 }}>
          {n.trecho || n.tipo}
        </span>
      </span>
      {!n.lida && <CheckCircle size={14} color="#0DD3C5" />}
    </button>
  );
}

function NoteCard({
  note,
  editing,
  onEdit,
  onCancel,
  onSave,
  onPin,
  onDelete,
}: {
  note: Record<string, unknown>;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (texto: string) => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [color, setColor] = useState(note.color);

  useEffect(() => {
    setTitle(note.title);
    setBody(note.body);
    setColor(note.color);
  }, [note.id, note.title, note.body, note.color]);

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${note.color}55`,
        borderTop: `4px solid ${note.color}`,
        borderRadius: 8,
        padding: 12,
      }}
    >
      {editing ? (
        <>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            style={{ ...inputStyle, marginTop: 8, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: c,
                  border: c === color ? "3px solid #0F172A" : "1px solid #fff",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button onClick={() => onSave({ title, body, color })} style={primaryBtn}>
              <Save size={13} /> Salvar
            </button>
            <button onClick={onCancel} style={ghostBtn}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <h3 style={{ flex: 1, fontSize: 13, fontWeight: 900, color: "#0F172A" }}>
              {note.title}
            </h3>
            {note.pinned && <Pin size={13} color={note.color} />}
          </div>
          <p
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 12,
              color: "#475569",
              lineHeight: 1.5,
              marginTop: 8,
            }}
          >
            {note.body}
          </p>
          <div style={{ display: "flex", gap: 5, marginTop: 12 }}>
            <button onClick={onPin} style={miniBtn}>
              <Pin size={12} />
            </button>
            <button onClick={onEdit} style={miniBtn}>
              <Edit3 size={12} />
            </button>
            <button onClick={onDelete} style={miniBtn}>
              <Trash2 size={12} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SectionTitle({
  icon,
  title,
  aside,
}: {
  icon: React.ReactNode;
  title: string;
  aside?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <span style={{ color: "#0DD3C5", display: "flex" }}>{icon}</span>
      <h2 style={{ fontSize: 14, fontWeight: 900, color: "#0F172A" }}>{title}</h2>
      {aside && (
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748B", fontWeight: 700 }}>
          {aside}
        </span>
      )}
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12, color: "#94A3B8", padding: "10px 0" }}>{children}</p>;
}

function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F0F5FF",
        color: "#64748B",
      }}
    >
      Carregando...
    </div>
  );
}

function compareCards(a: FlatCard, b: FlatCard) {
  const ad = a.prazo ? new Date(a.prazo).getTime() : Number.MAX_SAFE_INTEGER;
  const bd = b.prazo ? new Date(b.prazo).getTime() : Number.MAX_SAFE_INTEGER;
  return ad - bd;
}

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const panelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: 16,
  boxShadow: "0 2px 10px rgba(15,23,42,0.04)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12,
  color: "#0F172A",
  fontFamily: "inherit",
  outline: "none",
};

const primaryBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "#0DD3C5",
  border: "none",
  borderRadius: 8,
  color: "#fff",
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};

const ghostBtn: CSSProperties = {
  background: "#F1F5F9",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  color: "#64748B",
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const miniBtn: CSSProperties = {
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 7,
  color: "#64748B",
  padding: 6,
  display: "inline-flex",
  cursor: "pointer",
};

const topLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "#fff",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 700,
  opacity: 0.9,
};
