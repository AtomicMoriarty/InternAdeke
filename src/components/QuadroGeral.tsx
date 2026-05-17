import { useMemo, useState } from "react";
import { Filter, X, Calendar, MessageSquare, GripVertical } from "lucide-react";
import ItemModal from "@/components/ItemModal";
import { useDashboardState } from "@/lib/useDashboardState";
import {
  flattenDashboard, setItemKanbanStatus, KANBAN_COLUMNS, COLUMN_COLORS, MODULO_COLOR,
  type FlatCard, type KanbanStatus,
} from "@/lib/flattenItems";
import { useProfiles, initials, colorFor, type Profile } from "@/lib/profiles";
import { emitMudancaStatus } from "@/lib/notifications";
import { useCurrentUser } from "@/lib/useCurrentUser";

type Filters = {
  modulo: "LGPD" | "Compliance" | "ambos";
  clientes: string[];
  planos: string[];
  responsaveis: string[];
  status: string[];
  prazo: "todos" | "hoje" | "semana" | "atrasado";
};

const DEFAULTS: Filters = {
  modulo: "ambos", clientes: [], planos: [], responsaveis: [], status: [], prazo: "todos",
};

type Props = {
  filters: Filters;
  setFilters: (next: Partial<Filters>) => void;
};

export default function QuadroGeral({ filters, setFilters }: Props) {
  const { data, loaded, update } = useDashboardState();
  const profiles = useProfiles();
  const currentUser = useCurrentUser();
  const [dragging, setDragging] = useState<FlatCard | null>(null);
  const [hoverCol, setHoverCol] = useState<KanbanStatus | null>(null);
  const [modalItem, setModalItem] = useState<{ areaId: string; clienteId: string; planoId: string; itemId: string } | null>(null);

  const allCards = useMemo(() => (data ? flattenDashboard(data) : []), [data]);

  // Distinct sets for filter options
  const opts = useMemo(() => {
    const clientes = new Map<string, string>();
    const planos = new Map<string, string>();
    for (const c of allCards) { clientes.set(c.clienteId, c.clienteNome); planos.set(c.planoId, c.planoNome); }
    return {
      clientes: [...clientes.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      planos: [...planos.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [allCards]);

  const filtered = useMemo(() => filterCards(allCards, filters), [allCards, filters]);

  const cardsByStatus = useMemo(() => {
    const byStatus: Record<string, FlatCard[]> = {};
    for (const s of KANBAN_COLUMNS) byStatus[s] = [];
    for (const c of filtered) (byStatus[c.kanbanStatus] || (byStatus[c.kanbanStatus] = [])).push(c);
    return byStatus;
  }, [filtered]);

  const visibleCols = filters.status.length ? (filters.status as KanbanStatus[]) : (KANBAN_COLUMNS as readonly KanbanStatus[]);

  function moveCard(card: FlatCard, newStatus: KanbanStatus) {
    if (card.kanbanStatus === newStatus) return;
    update((prev: any) => {
      const next = setItemKanbanStatus(prev, card, newStatus);
      return next;
    });
    emitMudancaStatus({
      responsibleIds: card.responsaveis || [],
      novoStatus: newStatus,
      ctx: {
        cliente_id: card.clienteId,
        cliente_nome: card.clienteNome,
        modulo: card.modulo,
        plano_id: card.planoId,
        plano_nome: card.planoNome,
        item_id: card.itemId,
        item_nome: card.itemNome,
        autor_id: currentUser?.id || null,
        autor_nome: currentUser?.email || "sistema",
        trecho: `Status alterado de "${card.kanbanStatus}" para "${newStatus}"`,
      },
    });
  }

  function openCard(card: FlatCard) {
    setModalItem({ areaId: card.areaId, clienteId: card.clienteId, planoId: card.planoId, itemId: card.itemId });
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F0F5FF", fontFamily: "Outfit, sans-serif" }}>
      <FiltersBar
        filters={filters} setFilters={setFilters}
        opts={opts} profiles={profiles}
        counts={{ total: filtered.length, all: allCards.length }}
      />

      <div style={{
        display: "flex", gap: 14, padding: "18px 22px", overflowX: "auto",
        alignItems: "flex-start", minHeight: "calc(100vh - 130px)",
      }}>
        {visibleCols.map((status) => {
          const list = cardsByStatus[status] || [];
          const color = COLUMN_COLORS[status];
          const isHover = hoverCol === status;
          return (
            <div
              key={status}
              onDragOver={(e) => { e.preventDefault(); setHoverCol(status); }}
              onDragLeave={() => setHoverCol(null)}
              onDrop={() => {
                if (dragging) moveCard(dragging, status);
                setDragging(null); setHoverCol(null);
              }}
              style={{
                flex: "0 0 300px", background: isHover ? "#E0F2FE" : "#fff",
                border: `1px solid ${isHover ? color : "#E2E8F0"}`,
                borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", gap: 8,
                maxHeight: "calc(100vh - 150px)", transition: "background .15s, border-color .15s",
              }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px 8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>{status}</span>
                </div>
                <span style={{ fontSize: 11, color: "#64748B", fontWeight: 700 }}>{list.length}</span>
              </div>
              <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 2 }}>
                {list.map((card) => (
                  <KanbanCard
                    key={card.itemId} card={card} profiles={profiles}
                    onDragStart={() => setDragging(card)}
                    onDragEnd={() => { setDragging(null); setHoverCol(null); }}
                    onClick={() => openCard(card)}
                  />
                ))}
                {list.length === 0 && (
                  <div style={{ padding: "20px 8px", color: "#94A3B8", fontSize: 11, textAlign: "center" }}>
                    sem itens
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!loaded && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(240,245,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
          Carregando…
        </div>
      )}

      {modalItem && (
        <ItemModal
          areaId={modalItem.areaId}
          clienteId={modalItem.clienteId}
          planoId={modalItem.planoId}
          itemId={modalItem.itemId}
          onClose={() => setModalItem(null)}
        />
      )}
    </div>
  );
}

function KanbanCard({ card, profiles, onClick, onDragStart, onDragEnd }: {
  card: FlatCard; profiles: Profile[];
  onClick: () => void; onDragStart: () => void; onDragEnd: () => void;
}) {
  const moduloColor = MODULO_COLOR[card.modulo];
  const resps = (card.responsaveis || []).map((id) => profiles.find((p) => p.id === id)).filter(Boolean) as Profile[];
  const prazoState = prazoStatus(card.prazo);

  return (
    <div
      draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10,
        padding: 10, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8,
        borderLeft: `3px solid ${moduloColor}`,
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          fontSize: 9, fontWeight: 800, color: "#fff", background: moduloColor,
          padding: "2px 6px", borderRadius: 4, letterSpacing: 0.3,
        }}>{card.modulo}</span>
        <span style={{ fontSize: 10, color: "#64748B", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>
          {card.clienteNome}
        </span>
        <GripVertical size={12} color="#CBD5E1" style={{ marginLeft: "auto" }} />
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0F172A", lineHeight: 1.35 }}>
        {card.itemNome}
      </div>
      <div style={{ fontSize: 10.5, color: "#94A3B8" }}>{card.planoNome}</div>

      {card.subtotal > 0 && (
        <div>
          <div style={{ height: 4, background: "#F1F5F9", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${card.progresso}%`, height: "100%", background: COLUMN_COLORS[card.kanbanStatus] }} />
          </div>
          <div style={{ fontSize: 9.5, color: "#64748B", marginTop: 3 }}>{card.subdone}/{card.subtotal} subitens</div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
        <span style={{ display: "inline-flex" }}>
          {resps.slice(0, 4).map((p, i) => (
            <span key={p.id} title={p.display_name} style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 20, height: 20, borderRadius: "50%", background: p.avatar_color || colorFor(p.id),
              color: "#fff", fontSize: 9, fontWeight: 800, marginLeft: i === 0 ? 0 : -6, border: "1.5px solid #fff",
            }}>{initials(p.display_name)}</span>
          ))}
          {resps.length > 4 && (
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 20, height: 20, borderRadius: "50%", background: "#64748B", color: "#fff",
              fontSize: 9, fontWeight: 800, marginLeft: -6, border: "1.5px solid #fff",
            }}>+{resps.length - 4}</span>
          )}
          {resps.length === 0 && <span style={{ fontSize: 10, color: "#CBD5E1" }}>sem responsável</span>}
        </span>

        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
          {card.notasCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, color: "#64748B", fontWeight: 700 }}>
              <MessageSquare size={11} /> {card.notasCount}
            </span>
          )}
          {card.prazo && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 700,
              color: prazoState.color,
            }}>
              <Calendar size={11} /> {formatPrazo(card.prazo)}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

// ─── Filters Bar ─────────────────────────────────────────────────────────────
function FiltersBar({ filters, setFilters, opts, profiles, counts }: {
  filters: Filters; setFilters: (n: Partial<Filters>) => void;
  opts: { clientes: { id: string; name: string }[]; planos: { id: string; name: string }[] };
  profiles: Profile[]; counts: { total: number; all: number };
}) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 100, background: "#fff",
      borderBottom: "1px solid #E2E8F0", padding: "14px 22px",
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 6 }}>
        <Filter size={14} color="#0DD3C5" />
        <span style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>Filtros</span>
        <span style={{ fontSize: 11, color: "#64748B" }}>{counts.total} de {counts.all}</span>
      </div>

      {/* Módulo */}
      <SegmentChoice
        value={filters.modulo}
        onChange={(v) => setFilters({ modulo: v as any })}
        options={[{ v: "ambos", l: "Ambos" }, { v: "LGPD", l: "LGPD" }, { v: "Compliance", l: "Compliance" }]}
      />

      <MultiPicker label="Cliente" items={opts.clientes.map(c => ({ id: c.id, label: c.name }))}
        value={filters.clientes} onChange={(v) => setFilters({ clientes: v })} />
      <MultiPicker label="Plano" items={opts.planos.map(p => ({ id: p.id, label: p.name }))}
        value={filters.planos} onChange={(v) => setFilters({ planos: v })} />
      <MultiPicker label="Responsável" items={profiles.map(p => ({ id: p.id, label: p.display_name, sub: p.email }))}
        value={filters.responsaveis} onChange={(v) => setFilters({ responsaveis: v })} searchable />
      <MultiPicker label="Status" items={KANBAN_COLUMNS.map(s => ({ id: s, label: s }))}
        value={filters.status} onChange={(v) => setFilters({ status: v })} />

      <SegmentChoice
        value={filters.prazo}
        onChange={(v) => setFilters({ prazo: v as any })}
        options={[{ v: "todos", l: "Todos prazos" }, { v: "hoje", l: "Hoje" }, { v: "semana", l: "Semana" }, { v: "atrasado", l: "Atrasado" }]}
      />

      {(filters.clientes.length || filters.planos.length || filters.responsaveis.length || filters.status.length ||
        filters.modulo !== "ambos" || filters.prazo !== "todos") ? (
        <button onClick={() => setFilters(DEFAULTS)} style={{
          marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5,
          background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA",
          borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        }}>
          <X size={12} /> Limpar filtros
        </button>
      ) : null}
    </div>
  );
}

function SegmentChoice({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { v: string; l: string }[];
}) {
  return (
    <div style={{ display: "inline-flex", background: "#F1F5F9", borderRadius: 8, padding: 2 }}>
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{
          background: value === o.v ? "#fff" : "transparent",
          color: value === o.v ? "#0F172A" : "#64748B",
          border: "none", padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit",
          boxShadow: value === o.v ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
        }}>{o.l}</button>
      ))}
    </div>
  );
}

function MultiPicker({ label, items, value, onChange, searchable }: {
  label: string; items: { id: string; label: string; sub?: string }[];
  value: string[]; onChange: (v: string[]) => void; searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = q ? items.filter(i => (i.label + " " + (i.sub || "")).toLowerCase().includes(q.toLowerCase())) : items;
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: value.length ? "#F0FDFA" : "#fff",
        color: value.length ? "#0F766E" : "#475569",
        border: `1px solid ${value.length ? "#0DD3C5" : "#E2E8F0"}`,
        borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
        fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5,
      }}>
        {label}{value.length > 0 ? ` · ${value.length}` : ""}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 100,
            background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10,
            boxShadow: "0 10px 30px rgba(0,0,0,0.12)", minWidth: 260, maxHeight: 360,
            overflow: "hidden", display: "flex", flexDirection: "column",
          }}>
            {searchable && (
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..."
                autoFocus style={{ padding: "8px 10px", border: "none", borderBottom: "1px solid #F1F5F9", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
            )}
            <div style={{ overflow: "auto", padding: 4 }}>
              {filtered.length === 0 && <div style={{ padding: 12, fontSize: 11, color: "#94A3B8" }}>nada encontrado</div>}
              {filtered.map((it) => {
                const on = value.includes(it.id);
                return (
                  <button key={it.id} onClick={() => onChange(on ? value.filter(v => v !== it.id) : [...value, it.id])}
                    style={{
                      width: "100%", textAlign: "left", padding: "6px 8px", border: "none",
                      background: on ? "#F0FDFA" : "transparent", borderRadius: 6, cursor: "pointer",
                      fontSize: 12, color: "#0F172A", fontFamily: "inherit",
                      display: "flex", flexDirection: "column", gap: 1,
                    }}>
                    <span style={{ fontWeight: 600 }}>{it.label}</span>
                    {it.sub && <span style={{ fontSize: 10, color: "#94A3B8" }}>{it.sub}</span>}
                  </button>
                );
              })}
            </div>
            {value.length > 0 && (
              <button onClick={() => onChange([])} style={{
                padding: "8px 10px", border: "none", borderTop: "1px solid #F1F5F9", background: "#fff",
                color: "#94A3B8", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
              }}>Limpar</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Filter logic / prazo helpers ────────────────────────────────────────────
function filterCards(cards: FlatCard[], f: Filters): FlatCard[] {
  return cards.filter((c) => {
    if (f.modulo !== "ambos" && c.modulo !== f.modulo) return false;
    if (f.clientes.length && !f.clientes.includes(c.clienteId)) return false;
    if (f.planos.length && !f.planos.includes(c.planoId)) return false;
    if (f.responsaveis.length && !c.responsaveis.some((id) => f.responsaveis.includes(id))) return false;
    if (f.status.length && !f.status.includes(c.kanbanStatus)) return false;
    if (f.prazo !== "todos") {
      if (!c.prazo) return false;
      const ps = prazoStatus(c.prazo);
      if (f.prazo === "hoje" && ps.bucket !== "hoje") return false;
      if (f.prazo === "semana" && ps.bucket !== "hoje" && ps.bucket !== "semana") return false;
      if (f.prazo === "atrasado" && ps.bucket !== "atrasado") return false;
    }
    return true;
  });
}

function prazoStatus(iso: string): { bucket: "atrasado" | "hoje" | "semana" | "futuro" | ""; color: string } {
  if (!iso) return { bucket: "", color: "#64748B" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { bucket: "", color: "#64748B" };
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 86400000);
  if (diff < 0) return { bucket: "atrasado", color: "#DC2626" };
  if (diff === 0) return { bucket: "hoje", color: "#F97316" };
  if (diff <= 7) return { bucket: "semana", color: "#D97706" };
  return { bucket: "futuro", color: "#64748B" };
}

function formatPrazo(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
