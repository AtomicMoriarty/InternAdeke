// @ts-nocheck
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowLeft,
  Bell,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle,
  ChevronDown,
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
import { meusPassos, aplicarConclusao, type PassoNoContexto } from "@/lib/registros";
import {
  flattenDashboard,
  setItemKanbanStatus,
  COLUMN_COLORS,
  KANBAN_COLUMNS,
  type FlatCard,
  type KanbanStatus,
} from "@/lib/flattenItems";
import { etapasDaArea, temEtapasProprias, corDoEstado } from "@/lib/etapas";
import { parseBR } from "@/lib/relatorios";
import {
  useNotifications,
  markRead,
  emitMudancaStatus,
  descreverNotificacao,
  type Notification,
} from "@/lib/notifications";
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
  const { data, loaded, update } = useDashboardState("eu");
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

  /**
   * Separa as tarefas por urgência.
   *
   * Uma lista plana com tudo junto esconde o que importa: numa rotina movida a
   * prazo, o que está vencido precisa saltar aos olhos, e o que já foi entregue
   * só polui. Finalizadas saem do caminho, mas continuam contadas.
   */
  const grupos = useMemo(() => {
    const agora = new Date();
    const g = {
      vencidas: [] as FlatCard[],
      hoje: [] as FlatCard[],
      semana: [] as FlatCard[],
      depois: [] as FlatCard[],
      semPrazo: [] as FlatCard[],
      finalizadas: [] as FlatCard[],
    };
    for (const card of myTasks) {
      if (card.kanbanStatus === "Finalizado") {
        g.finalizadas.push(card);
        continue;
      }
      const prazo = parseBR(card.prazo);
      if (!prazo) {
        g.semPrazo.push(card);
        continue;
      }
      const dias = Math.round(
        (new Date(prazo.getFullYear(), prazo.getMonth(), prazo.getDate()).getTime() -
          new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime()) /
          86400000,
      );
      if (dias < 0) g.vencidas.push(card);
      else if (dias === 0) g.hoje.push(card);
      else if (dias <= 7) g.semana.push(card);
      else g.depois.push(card);
    }
    return g;
  }, [myTasks]);

  const emAberto = myTasks.length - grupos.finalizadas.length;

  /** O que está travado esperando alguém, separado do que está andando. */
  const esperando = useMemo(
    () =>
      myTasks.filter(
        (c) => c.kanbanStatus === "Pendência Interna" || c.kanbanStatus === "Pendência Cliente",
      ),
    [myTasks],
  );

  /**
   * Os retornos que você prometeu dar.
   *
   * Vem das anotações de follow-up: quem escreveu "retorno dia 20" assumiu um
   * compromisso que não aparece em lugar nenhum se ficar só dentro do card.
   */
  const meusProximosPassos = useMemo(
    () => (data ? meusPassos(data, currentUser?.id || null) : []),
    [data, currentUser?.id],
  );

  /** Marca o passo como feito direto daqui, sem precisar abrir o card. */
  function concluirPassoAqui(passo: PassoNoContexto) {
    update((prev) => aplicarConclusao(prev, passo));
  }

  /**
   * Quantas tarefas você finalizou nos últimos sete dias.
   *
   * Conta transições para "Finalizado" no statusHistory, não o status atual:
   * um card finalizado e reaberto não deve sumir da conta da semana, e um
   * finalizado há meses não deve entrar nela.
   */
  const finalizadasNaSemana = useMemo(() => {
    const corte = new Date();
    corte.setDate(corte.getDate() - 7);
    const itens = data ? flattenDashboard(data) : [];
    let n = 0;
    for (const card of itens) {
      if (!currentUser?.id || !card.responsaveis?.includes(currentUser.id)) continue;
      const hist = (card as unknown as { statusHistory?: { para: string; em: string }[] })
        .statusHistory;
      if (!Array.isArray(hist)) continue;
      if (hist.some((t) => t.para === "Finalizado" && new Date(t.em) >= corte)) n++;
    }
    return n;
  }, [data, currentUser?.id]);

  /** Muda o status sem sair da página, avisando os responsáveis como no quadro. */
  function mudarStatus(card: FlatCard, novo: string) {
    // Pela etapa: num card do INPI, kanbanStatus e o equivalente global e
    // nunca seria igual a etapa escolhida no menu.
    if ((card.etapa || card.kanbanStatus) === novo) return;
    update((prev) => setItemKanbanStatus(prev, card, novo));
    emitMudancaStatus({
      responsibleIds: card.responsaveis || [],
      novoStatus: novo,
      ctx: {
        cliente_id: card.clienteId,
        cliente_nome: card.clienteNome,
        modulo: card.modulo,
        plano_id: card.planoId,
        plano_nome: card.planoNome,
        item_id: card.itemId,
        item_nome: card.itemNome,
        autor_id: currentUser?.id || null,
        autor_nome: me?.display_name || currentUser?.email || "sistema",
        trecho: `Status alterado de "${card.etapa || card.kanbanStatus}" para "${novo}"`,
      },
    });
  }

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
            aside={`${emAberto} aberta${emAberto !== 1 ? "s" : ""}`}
          />
          {!loaded && <EmptyText>Carregando tarefas...</EmptyText>}
          {loaded && myTasks.length === 0 && (
            <EmptyText>Nenhuma tarefa atribuída a você por enquanto.</EmptyText>
          )}
          {loaded && myTasks.length > 0 && emAberto === 0 && (
            <EmptyText>Tudo em dia - nada em aberto atribuído a você.</EmptyText>
          )}

          {/* Contadores: o que exige atenção hoje, antes da lista */}
          {(emAberto > 0 || finalizadasNaSemana > 0) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {finalizadasNaSemana > 0 && (
                <Contador
                  n={finalizadasNaSemana}
                  rotulo="finalizada esta semana"
                  cor="#10B981"
                  fundo="#ECFDF5"
                />
              )}
              {esperando.length > 0 && (
                <Contador
                  n={esperando.length}
                  rotulo="aguardando"
                  cor="#F59E0B"
                  fundo="#FFFBEB"
                  plural={false}
                />
              )}
              {grupos.vencidas.length > 0 && (
                <Contador
                  n={grupos.vencidas.length}
                  rotulo="vencida"
                  cor="#DC2626"
                  fundo="#FEF2F2"
                />
              )}
              {grupos.hoje.length > 0 && (
                <Contador
                  n={grupos.hoje.length}
                  rotulo="para hoje"
                  cor="#F97316"
                  fundo="#FFF7ED"
                  plural={false}
                />
              )}
              {grupos.semana.length > 0 && (
                <Contador
                  n={grupos.semana.length}
                  rotulo="nesta semana"
                  cor="#B45309"
                  fundo="#FFFBEB"
                  plural={false}
                />
              )}
              {grupos.semPrazo.length > 0 && (
                <Contador
                  n={grupos.semPrazo.length}
                  rotulo="sem prazo"
                  cor="#64748B"
                  fundo="#F8FAFC"
                  plural={false}
                />
              )}
            </div>
          )}

          {meusProximosPassos.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <SectionTitle
                icon={<CalendarClock size={15} color="#0D9488" />}
                title="Retornos que você prometeu"
                aside={`${meusProximosPassos.length} em aberto`}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                {meusProximosPassos.map((passo) => (
                  <LinhaPasso
                    key={`${passo.itemId}-${passo.registroId}`}
                    passo={passo}
                    onConcluir={() => concluirPassoAqui(passo)}
                  />
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <GrupoTarefas
              titulo="Aguardando resposta"
              cards={esperando}
              cor="#F59E0B"
              onStatus={mudarStatus}
            />
            <GrupoTarefas
              titulo="Vencidas"
              cards={grupos.vencidas}
              cor="#DC2626"
              onStatus={mudarStatus}
            />
            <GrupoTarefas
              onStatus={mudarStatus}
              titulo="Para hoje"
              cards={grupos.hoje}
              cor="#F97316"
            />
            <GrupoTarefas
              onStatus={mudarStatus}
              titulo="Nesta semana"
              cards={grupos.semana}
              cor="#B45309"
            />
            <GrupoTarefas
              onStatus={mudarStatus}
              titulo="Mais adiante"
              cards={grupos.depois}
              cor="#64748B"
            />
            <GrupoTarefas
              onStatus={mudarStatus}
              titulo="Sem prazo"
              cards={grupos.semPrazo}
              cor="#94A3B8"
            />
            <GrupoTarefas titulo="Finalizadas" cards={grupos.finalizadas} cor="#10B981" recolhido />
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

/** Contador de urgência, exibido antes da lista. */
function Contador({
  n,
  rotulo,
  cor,
  fundo,
  plural = true,
}: {
  n: number;
  rotulo: string;
  cor: string;
  fundo: string;
  plural?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        borderRadius: 20,
        background: fundo,
        border: `1px solid ${cor}30`,
        color: cor,
        fontSize: 11,
        fontWeight: 800,
      }}
    >
      {n} {rotulo}
      {plural && n !== 1 ? "s" : ""}
    </span>
  );
}

/**
 * Um grupo de tarefas. Some quando vazio, para a tela não virar uma lista de
 * cabeçalhos sem conteúdo. Finalizadas nascem recolhidas.
 */
function GrupoTarefas({
  titulo,
  cards,
  cor,
  recolhido = false,
  onStatus,
}: {
  titulo: string;
  cards: FlatCard[];
  cor: string;
  recolhido?: boolean;
  onStatus?: (card: FlatCard, novo: KanbanStatus) => void;
}) {
  const [aberto, setAberto] = useState(!recolhido);
  if (!cards.length) return null;
  return (
    <div>
      <button
        onClick={() => setAberto((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          background: "none",
          border: "none",
          padding: "4px 0",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span
          style={{ width: 6, height: 6, borderRadius: "50%", background: cor, flexShrink: 0 }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: cor,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {titulo}
        </span>
        <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700 }}>{cards.length}</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#CBD5E1" }}>
          {aberto ? "ocultar" : "mostrar"}
        </span>
      </button>
      {aberto && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          {cards.map((card) => (
            <TaskRow key={`${card.planoId}-${card.itemId}`} card={card} onStatus={onStatus} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  card,
  onStatus,
}: {
  card: FlatCard;
  onStatus?: (card: FlatCard, novo: KanbanStatus) => void;
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  // Pela etapa, para o card do INPI nao sair com a cor de "A Fazer".
  const color = corDoEstado(card.etapa || card.kanbanStatus);
  // Sinais que já estavam nos dados e a página não mostrava.
  const parado = card.diasNoStatus !== null && card.diasNoStatus >= 7;
  const temChecklist = card.subtotal > 0;
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
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            justifyContent: "flex-end",
          }}
        >
          {temChecklist && (
            <span
              title={`Checklist: ${card.subdone} de ${card.subtotal}`}
              style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700 }}
            >
              {card.subdone}/{card.subtotal}
            </span>
          )}
          {parado && (
            <span
              title={`Sem movimento há ${card.diasNoStatus} dias`}
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: card.diasNoStatus! >= 14 ? "#DC2626" : "#B45309",
              }}
            >
              {card.diasNoStatus}d parado
            </span>
          )}
          <span style={{ fontSize: 10, color, fontWeight: 800 }}>
            {card.etapa || card.kanbanStatus}
          </span>

          {onStatus && card.kanbanStatus !== "Finalizado" && !temEtapasProprias(card.areaId) && (
            <button
              onClick={(e) => {
                // O Link envolve a linha inteira; sem barrar aqui, agir no card
                // também navegaria para ele.
                e.preventDefault();
                e.stopPropagation();
                onStatus(card, "Finalizado");
              }}
              title="Marcar como finalizada"
              style={acaoRapida}
            >
              <Check size={12} color="#10B981" />
            </button>
          )}

          {onStatus && (
            <span style={{ position: "relative", display: "inline-flex" }}>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuAberto((v) => !v);
                }}
                title="Mudar status"
                style={acaoRapida}
              >
                <ChevronDown size={12} color="#64748B" />
              </button>
              {menuAberto && (
                <>
                  <span
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuAberto(false);
                    }}
                    style={{ position: "fixed", inset: 0, zIndex: 60 }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      right: 0,
                      zIndex: 70,
                      background: "#fff",
                      border: "1px solid #E2E8F0",
                      borderRadius: 10,
                      boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
                      minWidth: 180,
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {etapasDaArea(card.areaId)
                      .map((et) => et.nome)
                      .map((st) => (
                        <button
                          key={st}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenuAberto(false);
                            onStatus(card, st);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 12px",
                            background:
                              st === (card.etapa || card.kanbanStatus) ? "#F8FAFC" : "transparent",
                            border: "none",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontSize: 11.5,
                            fontWeight: 600,
                            color: corDoEstado(st),
                            textAlign: "left",
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: corDoEstado(st),
                              flexShrink: 0,
                            }}
                          />
                          {st}
                        </button>
                      ))}
                  </span>
                </>
              )}
            </span>
          )}
        </span>
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
          {descreverNotificacao(n).titulo}
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

const acaoRapida: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  borderRadius: 6,
  border: "1px solid #E2E8F0",
  background: "#fff",
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
};

/**
 * Um retorno prometido, com o card de onde saiu.
 *
 * Atrasado fica vermelho porque é a informação que muda o que você faz agora.
 */
function LinhaPasso({ passo, onConcluir }: { passo: PassoNoContexto; onConcluir: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 9,
        background: passo.atrasado ? "#FEF2F2" : "#fff",
        border: `1px solid ${passo.atrasado ? "#FECACA" : "#E2E8F0"}`,
        borderRadius: 10,
        padding: "9px 12px",
      }}
    >
      <button
        onClick={onConcluir}
        title="Marcar como feito"
        style={{
          width: 17,
          height: 17,
          borderRadius: 5,
          border: `1.5px solid ${passo.atrasado ? "#DC2626" : "#CBD5E1"}`,
          background: "#fff",
          cursor: "pointer",
          flexShrink: 0,
          marginTop: 1,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{passo.texto}</div>
        <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>
          {passo.clienteNome} › {passo.itemNome}
        </div>
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: passo.atrasado ? "#DC2626" : "#64748B",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {passo.quando || "sem data"}
      </span>
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

/**
 * Ordena por prazo, com quem não tem prazo por último.
 *
 * O prazo é gravado como DD/MM/AAAA, e new Date() lê isso como MM/DD/AAAA: um
 * prazo de 14/11 vira data inválida, e um de 05/03 vira 3 de maio em vez de 5
 * de março — silenciosamente na ordem errada. parseBR entende o formato certo.
 */
function compareCards(a: FlatCard, b: FlatCard) {
  const ad = parseBR(a.prazo)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bd = parseBR(b.prazo)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return ad - bd;
}

/** Exibe a data. Aceita tanto DD/MM/AAAA quanto ISO. */
function formatDate(value: string) {
  const d = parseBR(value) || new Date(value);
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
