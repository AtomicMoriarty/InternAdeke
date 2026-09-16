import { useMemo, useState, useRef, useEffect } from "react";
import type { CSSProperties } from "react";
import {
  Filter,
  X,
  Calendar,
  MessageSquare,
  GripVertical,
  CalendarClock,
  Check,
  CheckSquare,
  Search,
  Bookmark,
} from "lucide-react";
import ItemModal from "@/components/ItemModal";
import { useDashboardState } from "@/lib/useDashboardState";
import {
  flattenDashboard,
  setItemKanbanStatus,
  KANBAN_COLUMNS,
  COLUMN_COLORS,
  MODULO_COLOR,
  type FlatCard,
  type KanbanStatus,
} from "@/lib/flattenItems";
import { useProfiles, initials, colorFor, type Profile } from "@/lib/profiles";
import { emitMudancaStatus, emitAtribuicao } from "@/lib/notifications";
import { aplicarEmLote, descreverAcao, type AcaoEmLote } from "@/lib/edicaoEmLote";
import { useCurrentUser } from "@/lib/useCurrentUser";
import type { DashboardState } from "@/lib/dashboardTypes";
import { MODULOS, ALL_MODULES, allowedModulesFor, AREAS } from "@/lib/areas";
import { etapasDaArea, temEtapasProprias, type Etapa } from "@/lib/etapas";

type Filters = {
  modulo: string; // rotulo do modulo, ou "ambos" para todos
  clientes: string[];
  planos: string[];
  responsaveis: string[];
  status: string[];
  prazo: "todos" | "hoje" | "semana" | "atrasado";
  /** Texto livre: procura no nome do card, no cliente, no plano e nas etiquetas. */
  busca: string;
};

const DEFAULTS: Filters = {
  modulo: "ambos",
  clientes: [],
  planos: [],
  responsaveis: [],
  status: [],
  prazo: "todos",
  busca: "",
};

/**
 * Onde fica o jeito preferido de ver o quadro.
 *
 * É preferência de quem olha, não dado do escritório: mora no navegador, por
 * usuário, para uma máquina compartilhada não misturar o filtro de um com o do
 * outro.
 */
const CHAVE_PADRAO = "adeke:quadro:padrao:";

function lerPadrao(userId?: string): Filters | null {
  if (!userId) return null;
  try {
    const cru = localStorage.getItem(CHAVE_PADRAO + userId);
    return cru ? { ...DEFAULTS, ...(JSON.parse(cru) as Filters) } : null;
  } catch {
    // Aba anônima, storage bloqueado: sem preferência é só abrir no padrão.
    return null;
  }
}

function gravarPadrao(userId: string, f: Filters) {
  try {
    localStorage.setItem(CHAVE_PADRAO + userId, JSON.stringify(f));
  } catch {
    // Não poder lembrar não pode quebrar o filtro que a pessoa acabou de usar.
  }
}

function apagarPadrao(userId: string) {
  try {
    localStorage.removeItem(CHAVE_PADRAO + userId);
  } catch {
    /* idem */
  }
}

/** O quadro está como veio, sem ninguém ter mexido em nada? */
function semFiltro(f: Filters): boolean {
  return (
    f.modulo === "ambos" &&
    f.prazo === "todos" &&
    !f.busca &&
    !f.clientes.length &&
    !f.planos.length &&
    !f.responsaveis.length &&
    !f.status.length
  );
}

type Props = {
  filters: Filters;
  setFilters: (next: Partial<Filters>) => void;
  allowedModules?: string[];
};

export default function QuadroGeral({ filters, setFilters, allowedModules }: Props) {
  const { data, loaded, update } = useDashboardState("quadro");
  const profiles = useProfiles();
  const currentUser = useCurrentUser();
  const currentProfile = currentUser ? profiles.find((p) => p.id === currentUser.id) : null;
  const visibleModules = allowedModules || allowedModulesFor(currentProfile);

  // Abriu o quadro sem filtro nenhum? Aplica o jeito que a pessoa deixou
  // salvo. Só na abertura: depois disso ela está dirigindo, e reaplicar o
  // padrão por cima de uma escolha dela seria teimosia.
  const padraoAplicado = useRef(false);
  useEffect(() => {
    if (padraoAplicado.current || !currentUser) return;
    padraoAplicado.current = true;
    if (!semFiltro(filters)) return;
    const padrao = lerPadrao(currentUser.id);
    if (padrao && !semFiltro(padrao)) setFilters(padrao);
  }, [currentUser, filters, setFilters]);
  const [dragging, setDragging] = useState<FlatCard | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);
  const [modalItem, setModalItem] = useState<{
    areaId: string;
    clienteId: string;
    planoId: string;
    itemId: string;
  } | null>(null);
  // Edicao em lote: fora do modo selecao o quadro funciona como antes.
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const allCards = useMemo(
    () =>
      data ? flattenDashboard(data).filter((card) => visibleModules.includes(card.areaId)) : [],
    [data, visibleModules],
  );

  // Opções dos filtros, agrupadas por nome e não por id.
  //
  // Cada área tem o seu próprio vínculo para a mesma empresa, com id diferente.
  // Agrupando por id, a INFOPAGO aparecia três vezes na lista, e escolher uma
  // trazia só os cards de uma área — parecia empresa repetida e filtrava menos
  // do que a pessoa pediu. É uma empresa só, e escolhê-la traz o que ela tem em
  // todo lugar. Vale igual para o plano: "Importado do Trello" é um só.
  const opts = useMemo(() => {
    const clientes = new Map<string, string>();
    const planos = new Map<string, string>();
    for (const c of allCards) {
      clientes.set(chaveDeNome(c.clienteNome), c.clienteNome);
      planos.set(chaveDeNome(c.planoNome), c.planoNome);
    }
    return {
      clientes: [...clientes.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      planos: [...planos.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [allCards]);

  const filtered = useMemo(() => filterCards(allCards, filters), [allCards, filters]);

  // Filtrado numa área só que tem etapas próprias, o quadro mostra as etapas
  // dela. Misturando áreas não dá: "Exame de mérito" não quer dizer nada para
  // um card de Societário, e a língua comum são as sete colunas.
  const areaDasEtapas = useMemo(() => {
    if (filters.modulo === "ambos") return "";
    const area = AREAS.find((a) => a.modulo === filters.modulo);
    return area && temEtapasProprias(area.id) ? area.id : "";
  }, [filters.modulo]);

  const colunas: Etapa[] = useMemo(() => etapasDaArea(areaDasEtapas), [areaDasEtapas]);
  const chaveDaColuna = (c: FlatCard) => (areaDasEtapas ? c.etapa : c.kanbanStatus);

  const cardsByStatus = useMemo(() => {
    const byStatus: Record<string, FlatCard[]> = {};
    for (const e of colunas) byStatus[e.nome] = [];
    for (const c of filtered) {
      const k = areaDasEtapas ? c.etapa : c.kanbanStatus;
      (byStatus[k] || (byStatus[k] = [])).push(c);
    }
    return byStatus;
  }, [filtered, colunas, areaDasEtapas]);

  // Trocar de área troca as colunas, e um status escolhido na área anterior
  // pode não existir aqui. Nesse caso o filtro é ignorado em vez de esvaziar o
  // quadro sem explicação.
  const visibleCols = useMemo(() => {
    const escolhidas = colunas.filter((e) => filters.status.includes(e.nome));
    return escolhidas.length ? escolhidas : colunas;
  }, [colunas, filters.status]);

  function moveCard(card: FlatCard, newStatus: string) {
    if (chaveDaColuna(card) === newStatus) return;
    update((prev: DashboardState) => {
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

  function alternarSelecao(itemId: string) {
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (n.has(itemId)) n.delete(itemId);
      else n.add(itemId);
      return n;
    });
  }

  function sairDoModoSelecao() {
    setModoSelecao(false);
    setSelecionados(new Set());
  }

  const cardsSelecionados = useMemo(
    () => filtered.filter((c) => selecionados.has(c.itemId)),
    [filtered, selecionados],
  );

  function executarEmLote(acaoRecebida: AcaoEmLote) {
    if (!cardsSelecionados.length) return;
    const alvos = cardsSelecionados;
    // A barra nao conhece o usuario logado; o autor e preenchido aqui.
    const acao: AcaoEmLote =
      acaoRecebida.tipo === "comentario"
        ? {
            ...acaoRecebida,
            autorId: currentUser?.id || null,
            autorNome: currentProfile?.display_name || currentUser?.email || "sistema",
          }
        : acaoRecebida;
    update((prev: DashboardState) => aplicarEmLote(prev, alvos, acao).data);

    // Atribuir em lote precisa avisar quem foi atribuido — sem isto a pessoa
    // so descobriria abrindo a propria pagina. "remover" nao gera aviso: nao ha
    // o que a pessoa fazer com essa informacao.
    if (acao.tipo === "responsaveis" && acao.modo !== "remover") {
      for (const card of alvos) {
        emitAtribuicao({
          newIds: acao.ids,
          oldIds: acao.modo === "substituir" ? [] : card.responsaveis || [],
          ctx: {
            cliente_id: card.clienteId,
            cliente_nome: card.clienteNome,
            modulo: card.modulo,
            plano_id: card.planoId,
            plano_nome: card.planoNome,
            item_id: card.itemId,
            item_nome: card.itemNome,
            autor_id: currentUser?.id || null,
            autor_nome: currentProfile?.display_name || currentUser?.email || "sistema",
            trecho: "foi atribuído(a) a este item",
          },
        });
      }
    }

    // Mudanca de status avisa os responsaveis, igual ao arrastar um card
    if (acao.tipo === "status") {
      for (const card of alvos) {
        if (card.kanbanStatus === acao.status) continue;
        emitMudancaStatus({
          responsibleIds: card.responsaveis || [],
          novoStatus: acao.status,
          ctx: {
            cliente_id: card.clienteId,
            cliente_nome: card.clienteNome,
            modulo: card.modulo,
            plano_id: card.planoId,
            plano_nome: card.planoNome,
            item_id: card.itemId,
            item_nome: card.itemNome,
            autor_id: currentUser?.id || null,
            autor_nome: currentProfile?.display_name || currentUser?.email || "sistema",
            trecho: `Status alterado de "${card.kanbanStatus}" para "${acao.status}" (edição em lote)`,
          },
        });
      }
    }
    sairDoModoSelecao();
  }

  function openCard(card: FlatCard) {
    // Produtos abrem normalmente: o ItemModal sabe ler data.produtos.
    setModalItem({
      areaId: card.areaId,
      clienteId: card.clienteId,
      planoId: card.planoId,
      itemId: card.itemId,
    });
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F0F5FF", fontFamily: "Outfit, sans-serif" }}>
      <FiltersBar
        filters={filters}
        setFilters={setFilters}
        opts={opts}
        colunas={colunas}
        userId={currentUser?.id}
        profiles={profiles}
        counts={{ total: filtered.length, all: allCards.length }}
        modoSelecao={modoSelecao}
        onToggleSelecao={() => (modoSelecao ? sairDoModoSelecao() : setModoSelecao(true))}
      />

      <div
        style={{
          display: "flex",
          gap: 14,
          padding: "18px 22px",
          overflowX: "auto",
          alignItems: "flex-start",
          minHeight: "calc(100vh - 130px)",
        }}
      >
        {visibleCols.map((etapa) => {
          const status = etapa.nome;
          const list = cardsByStatus[status] || [];
          const color = etapa.cor;
          const isHover = hoverCol === status;
          return (
            <div
              key={status}
              title={etapa.ajuda}
              onDragOver={(e) => {
                e.preventDefault();
                setHoverCol(status);
              }}
              onDragLeave={() => setHoverCol(null)}
              onDrop={() => {
                if (dragging) moveCard(dragging, status);
                setDragging(null);
                setHoverCol(null);
              }}
              style={{
                flex: "0 0 300px",
                background: isHover ? "#E0F2FE" : "#fff",
                border: `1px solid ${isHover ? color : "#E2E8F0"}`,
                borderRadius: 12,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                maxHeight: "calc(100vh - 150px)",
                transition: "background .15s, border-color .15s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "4px 6px 8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>{status}</span>
                </div>
                <span style={{ fontSize: 11, color: "#64748B", fontWeight: 700 }}>
                  {list.length}
                </span>
              </div>
              <div
                style={{
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  paddingRight: 2,
                }}
              >
                {list.map((card) => (
                  <KanbanCard
                    key={card.itemId}
                    card={card}
                    profiles={profiles}
                    onDragStart={() => setDragging(card)}
                    onDragEnd={() => {
                      setDragging(null);
                      setHoverCol(null);
                    }}
                    onClick={() => (modoSelecao ? alternarSelecao(card.itemId) : openCard(card))}
                    modoSelecao={modoSelecao}
                    selecionado={selecionados.has(card.itemId)}
                  />
                ))}
                {list.length === 0 && (
                  <div
                    style={{
                      padding: "20px 8px",
                      color: "#94A3B8",
                      fontSize: 11,
                      textAlign: "center",
                    }}
                  >
                    sem itens
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!loaded && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(240,245,255,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#64748B",
          }}
        >
          Carregando…
        </div>
      )}

      {modoSelecao && (
        <BarraDeLote
          quantos={cardsSelecionados.length}
          totalVisivel={filtered.length}
          profiles={profiles}
          colunas={colunas}
          areaId={areaDasEtapas}
          onSelecionarTodos={() => setSelecionados(new Set(filtered.map((c) => c.itemId)))}
          onLimpar={() => setSelecionados(new Set())}
          onSair={sairDoModoSelecao}
          onAcao={executarEmLote}
        />
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

function KanbanCard({
  card,
  profiles,
  onClick,
  onDragStart,
  onDragEnd,
  // Estas duas vêm do modo de seleção em lote. Estavam sendo passadas pelo
  // pai e nunca declaradas aqui, o que derrubava o Quadro Geral inteiro no
  // primeiro card renderizado.
  modoSelecao = false,
  selecionado = false,
}: {
  card: FlatCard;
  profiles: Profile[];
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  modoSelecao?: boolean;
  selecionado?: boolean;
}) {
  const moduloColor = MODULO_COLOR[card.modulo];
  const resps = (card.responsaveis || [])
    .map((id) => profiles.find((p) => p.id === id))
    .filter(Boolean) as Profile[];
  const prazoState = prazoStatus(card.prazo);

  // Track if a real drag happened so a drag-release doesn't also trigger onClick
  const draggedRef = useRef(false);

  return (
    <div
      draggable={!modoSelecao}
      role="button"
      tabIndex={0}
      aria-pressed={modoSelecao ? !!selecionado : undefined}
      aria-label={
        modoSelecao
          ? `${selecionado ? "Desmarcar" : "Marcar"} card: ${card.itemNome}`
          : `Abrir card: ${card.itemNome}`
      }
      onDragStart={() => {
        draggedRef.current = true;
        onDragStart();
      }}
      onDragEnd={() => {
        onDragEnd();
        setTimeout(() => {
          draggedRef.current = false;
        }, 0);
      }}
      onClick={(e) => {
        if (draggedRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!draggedRef.current) onClick();
        }
      }}
      style={{
        // Sem marca visível, o modo de seleção não dizia o que estava marcado:
        // só o leitor de tela sabia, pelo aria-pressed.
        background: selecionado ? "#F0FDFA" : "#fff",
        border: `1px solid ${selecionado ? "#0DD3C5" : "#E2E8F0"}`,
        boxShadow: selecionado ? "0 0 0 1px #0DD3C5" : "none",
        borderRadius: 10,
        padding: 10,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        borderLeft: `3px solid ${moduloColor}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 800,
            color: "#fff",
            background: moduloColor,
            padding: "2px 6px",
            borderRadius: 4,
            letterSpacing: 0.3,
          }}
        >
          {card.modulo}
        </span>
        <span
          style={{
            fontSize: 10,
            color: "#64748B",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          {card.clienteNome}
        </span>
        {card.acompanhado && (
          <span
            title="Acompanhamento semanal ligado"
            style={{ marginLeft: "auto", display: "inline-flex" }}
          >
            <CalendarClock size={12} color="#0DD3C5" />
          </span>
        )}
        <GripVertical
          size={12}
          color="#CBD5E1"
          style={{ marginLeft: card.acompanhado ? 4 : "auto" }}
        />
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0F172A", lineHeight: 1.35 }}>
        {card.itemNome}
      </div>
      <div style={{ fontSize: 10.5, color: "#94A3B8" }}>{card.planoNome}</div>

      {card.subtotal > 0 && (
        <div>
          <div style={{ height: 4, background: "#F1F5F9", borderRadius: 2, overflow: "hidden" }}>
            <div
              style={{
                width: `${card.progresso}%`,
                height: "100%",
                background: COLUMN_COLORS[card.kanbanStatus],
              }}
            />
          </div>
          <div style={{ fontSize: 9.5, color: "#64748B", marginTop: 3 }}>
            {card.subdone}/{card.subtotal} subitens
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
        <span style={{ display: "inline-flex" }}>
          {resps.slice(0, 4).map((p, i) => (
            <span
              key={p.id}
              title={p.display_name}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 20,
                height: 20,
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
          {resps.length > 4 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "#64748B",
                color: "#fff",
                fontSize: 9,
                fontWeight: 800,
                marginLeft: -6,
                border: "1.5px solid #fff",
              }}
            >
              +{resps.length - 4}
            </span>
          )}
          {resps.length === 0 && (
            <span style={{ fontSize: 10, color: "#CBD5E1" }}>sem responsável</span>
          )}
        </span>

        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
          {card.notasCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: 10.5,
                color: "#64748B",
                fontWeight: 700,
              }}
            >
              <MessageSquare size={11} /> {card.notasCount}
            </span>
          )}
          {card.prazo && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: 10.5,
                fontWeight: 700,
                color: prazoState.color,
              }}
            >
              <Calendar size={11} /> {formatPrazo(card.prazo)}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

// ─── Filters Bar ─────────────────────────────────────────────────────────────
function FiltersBar({
  filters,
  setFilters,
  opts,
  profiles,
  counts,
  colunas,
  userId,
  // O pai já passava as duas, mas elas não estavam declaradas aqui e o botão
  // nunca chegou a ser desenhado — a edição em lote existia sem porta de entrada.
  modoSelecao = false,
  onToggleSelecao,
}: {
  filters: Filters;
  setFilters: (n: Partial<Filters>) => void;
  opts: { clientes: { id: string; name: string }[]; planos: { id: string; name: string }[] };
  profiles: Profile[];
  counts: { total: number; all: number };
  /** As colunas do quadro agora: as sete, ou as etapas da área filtrada. */
  colunas: Etapa[];
  userId?: string;
  modoSelecao?: boolean;
  onToggleSelecao?: () => void;
}) {
  const [salvo, setSalvo] = useState(false);
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "#fff",
        borderBottom: "1px solid #E2E8F0",
        padding: "14px 22px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 6 }}>
        <Filter size={14} color="#0DD3C5" />
        <span style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>Filtros</span>
        <span style={{ fontSize: 11, color: "#64748B" }}>
          {counts.total} de {counts.all}
        </span>
      </div>

      <div style={{ position: "relative" }}>
        <Search
          size={13}
          style={{
            position: "absolute",
            left: 9,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#94A3B8",
          }}
        />
        <input
          value={filters.busca}
          onChange={(e) => setFilters({ busca: e.target.value })}
          placeholder="Buscar card..."
          style={{
            background: filters.busca ? "#F0FDFA" : "#fff",
            border: `1px solid ${filters.busca ? "#0DD3C5" : "#E2E8F0"}`,
            borderRadius: 8,
            padding: "6px 10px 6px 26px",
            fontSize: 11,
            fontWeight: 600,
            color: "#0F172A",
            fontFamily: "inherit",
            outline: "none",
            width: 190,
          }}
        />
        {filters.busca && (
          <button
            onClick={() => setFilters({ busca: "" })}
            title="Limpar a busca"
            style={{
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 2,
              lineHeight: 0,
            }}
          >
            <X size={12} color="#94A3B8" />
          </button>
        )}
      </div>

      {/* Módulo */}
      <SegmentChoice
        value={filters.modulo}
        onChange={(v) => setFilters({ modulo: v })}
        options={[{ v: "ambos", l: "Todos" }, ...MODULOS.map((m) => ({ v: m, l: m }))]}
      />

      <MultiPicker
        label="Cliente"
        items={opts.clientes.map((c) => ({ id: c.id, label: c.name }))}
        value={filters.clientes}
        onChange={(v) => setFilters({ clientes: v })}
        searchable
      />
      <MultiPicker
        label="Plano"
        items={opts.planos.map((p) => ({ id: p.id, label: p.name }))}
        value={filters.planos}
        onChange={(v) => setFilters({ planos: v })}
        searchable
      />
      <MultiPicker
        label="Responsável"
        items={profiles.map((p) => ({ id: p.id, label: p.display_name, sub: p.email }))}
        value={filters.responsaveis}
        onChange={(v) => setFilters({ responsaveis: v })}
        searchable
      />
      {onToggleSelecao && (
        <button
          onClick={onToggleSelecao}
          title={
            modoSelecao
              ? "Sair do modo de seleção"
              : "Selecionar vários cards para editar de uma vez"
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginLeft: "auto",
            background: modoSelecao ? "#0DD3C5" : "#fff",
            border: `1px solid ${modoSelecao ? "#0DD3C5" : "#E2E8F0"}`,
            color: modoSelecao ? "#fff" : "#475569",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          <CheckSquare size={14} />
          {modoSelecao ? "Sair da seleção" : "Selecionar vários"}
        </button>
      )}

      <MultiPicker
        label="Status"
        items={colunas.map((e) => ({ id: e.nome, label: e.nome, sub: e.ajuda }))}
        value={filters.status}
        onChange={(v) => setFilters({ status: v })}
      />

      <SegmentChoice
        value={filters.prazo}
        onChange={(v) => setFilters({ prazo: v as Filters["prazo"] })}
        options={[
          { v: "todos", l: "Todos prazos" },
          { v: "hoje", l: "Hoje" },
          { v: "semana", l: "Semana" },
          { v: "atrasado", l: "Atrasado" },
        ]}
      />

      {userId && (
        <button
          onClick={() => {
            if (semFiltro(filters)) apagarPadrao(userId);
            else gravarPadrao(userId, filters);
            setSalvo(true);
            setTimeout(() => setSalvo(false), 2200);
          }}
          title={
            semFiltro(filters)
              ? "Voltar a abrir o quadro sem filtro nenhum"
              : "Abrir o quadro já assim da próxima vez"
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: salvo ? "#0DD3C5" : "#fff",
            border: `1px solid ${salvo ? "#0DD3C5" : "#E2E8F0"}`,
            color: salvo ? "#fff" : "#475569",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          <Bookmark size={12} />
          {salvo ? "Guardado" : semFiltro(filters) ? "Esquecer padrão" : "Abrir sempre assim"}
        </button>
      )}

      {filters.clientes.length ||
      filters.planos.length ||
      filters.responsaveis.length ||
      filters.status.length ||
      filters.busca ||
      filters.modulo !== "ambos" ||
      filters.prazo !== "todos" ? (
        <button
          onClick={() => setFilters(DEFAULTS)}
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: "#FEF2F2",
            color: "#DC2626",
            border: "1px solid #FECACA",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <X size={12} /> Limpar filtros
        </button>
      ) : null}
    </div>
  );
}

function SegmentChoice({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div style={{ display: "inline-flex", background: "#F1F5F9", borderRadius: 8, padding: 2 }}>
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          style={{
            background: value === o.v ? "#fff" : "transparent",
            color: value === o.v ? "#0F172A" : "#64748B",
            border: "none",
            padding: "5px 10px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            boxShadow: value === o.v ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
          }}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function MultiPicker({
  label,
  items,
  value,
  onChange,
  searchable,
}: {
  label: string;
  items: { id: string; label: string; sub?: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = q
    ? items.filter((i) => (i.label + " " + (i.sub || "")).toLowerCase().includes(q.toLowerCase()))
    : items;
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: value.length ? "#F0FDFA" : "#fff",
          color: value.length ? "#0F766E" : "#475569",
          border: `1px solid ${value.length ? "#0DD3C5" : "#E2E8F0"}`,
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        {label}
        {value.length > 0 ? ` · ${value.length}` : ""}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              zIndex: 100,
              background: "#fff",
              border: "1px solid #E2E8F0",
              borderRadius: 10,
              boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
              minWidth: 260,
              maxHeight: 360,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {searchable && (
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar..."
                autoFocus
                style={{
                  padding: "8px 10px",
                  border: "none",
                  borderBottom: "1px solid #F1F5F9",
                  fontSize: 12,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            )}
            <div style={{ overflow: "auto", padding: 4 }}>
              {filtered.length === 0 && (
                <div style={{ padding: 12, fontSize: 11, color: "#94A3B8" }}>nada encontrado</div>
              )}
              {filtered.map((it) => {
                const on = value.includes(it.id);
                return (
                  <button
                    key={it.id}
                    onClick={() =>
                      onChange(on ? value.filter((v) => v !== it.id) : [...value, it.id])
                    }
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "6px 8px",
                      border: "none",
                      background: on ? "#F0FDFA" : "transparent",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 12,
                      color: "#0F172A",
                      fontFamily: "inherit",
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{it.label}</span>
                    {it.sub && <span style={{ fontSize: 10, color: "#94A3B8" }}>{it.sub}</span>}
                  </button>
                );
              })}
            </div>
            {value.length > 0 && (
              <button
                onClick={() => onChange([])}
                style={{
                  padding: "8px 10px",
                  border: "none",
                  borderTop: "1px solid #F1F5F9",
                  background: "#fff",
                  color: "#94A3B8",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Limpar
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Barra de edição em lote ─────────────────────────────────────────────────
function BarraDeLote({
  quantos,
  totalVisivel,
  profiles,
  colunas,
  areaId,
  onSelecionarTodos,
  onLimpar,
  onSair,
  onAcao,
}: {
  quantos: number;
  totalVisivel: number;
  profiles: Profile[];
  colunas: Etapa[];
  /** A área filtrada, quando as colunas são as etapas dela. */
  areaId: string;
  onSelecionarTodos: () => void;
  onLimpar: () => void;
  onSair: () => void;
  onAcao: (a: AcaoEmLote) => void;
}) {
  const [menu, setMenu] = useState<null | "status" | "membros" | "comentario">(null);
  const [texto, setTexto] = useState("");
  const [membros, setMembros] = useState<string[]>([]);
  const nada = quantos === 0;

  function fechar() {
    setMenu(null);
    setTexto("");
    setMembros([]);
  }

  return (
    <div
      role="region"
      aria-label="Edição em lote"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: 20,
        zIndex: 500,
        background: "#0F172A",
        color: "#fff",
        borderRadius: 12,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
        fontFamily: "Outfit, sans-serif",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>
        {nada ? "Nenhum card selecionado" : `${quantos} selecionado${quantos !== 1 ? "s" : ""}`}
      </span>

      <button
        onClick={onSelecionarTodos}
        style={btnLote}
        title={`Selecionar os ${totalVisivel} cards visíveis`}
      >
        Todos ({totalVisivel})
      </button>
      {!nada && (
        <button onClick={onLimpar} style={btnLote}>
          Limpar
        </button>
      )}

      <span style={{ width: 1, height: 20, background: "#334155" }} />

      {/* Status */}
      <div style={{ position: "relative" }}>
        <button
          disabled={nada}
          onClick={() => setMenu(menu === "status" ? null : "status")}
          style={btnLote}
        >
          Status ▾
        </button>
        {menu === "status" && (
          <div style={popLote}>
            {colunas.map((e) => (
              <button
                key={e.nome}
                onClick={() => {
                  onAcao({ tipo: "status", status: e.nome, areaId });
                  fechar();
                }}
                style={{ ...itemPop, color: e.cor }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: e.cor,
                    flexShrink: 0,
                  }}
                />
                {e.nome}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Membros */}
      <div style={{ position: "relative" }}>
        <button
          disabled={nada}
          onClick={() => setMenu(menu === "membros" ? null : "membros")}
          style={btnLote}
        >
          Membros ▾
        </button>
        {menu === "membros" && (
          <div style={{ ...popLote, minWidth: 250 }}>
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {profiles.map((p) => {
                const on = membros.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() =>
                      setMembros((m) => (on ? m.filter((x) => x !== p.id) : [...m, p.id]))
                    }
                    style={{
                      ...itemPop,
                      background: on ? "#F0FDFA" : "transparent",
                      color: "#0F172A",
                    }}
                  >
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: p.avatar_color || colorFor(p.id),
                        color: "#fff",
                        fontSize: 8,
                        fontWeight: 800,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {initials(p.display_name)}
                    </span>
                    {p.display_name}
                    {on && <Check size={12} color="#0DD3C5" style={{ marginLeft: "auto" }} />}
                  </button>
                );
              })}
            </div>
            {membros.length > 0 && (
              <div style={{ display: "flex", gap: 4, padding: 6, borderTop: "1px solid #F1F5F9" }}>
                <button
                  onClick={() => {
                    onAcao({ tipo: "responsaveis", ids: membros, modo: "adicionar" });
                    fechar();
                  }}
                  style={btnPop}
                >
                  Adicionar
                </button>
                <button
                  onClick={() => {
                    onAcao({ tipo: "responsaveis", ids: membros, modo: "remover" });
                    fechar();
                  }}
                  style={btnPopSec}
                >
                  Remover
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Comentário */}
      <div style={{ position: "relative" }}>
        <button
          disabled={nada}
          onClick={() => setMenu(menu === "comentario" ? null : "comentario")}
          style={btnLote}
        >
          Comentar ▾
        </button>
        {menu === "comentario" && (
          <div style={{ ...popLote, minWidth: 280, padding: 8 }}>
            <textarea
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Mesmo comentário em todos os selecionados..."
              rows={3}
              style={{
                width: "100%",
                border: "1px solid #E2E8F0",
                borderRadius: 8,
                padding: "7px 9px",
                fontSize: 12,
                fontFamily: "inherit",
                resize: "vertical",
                outline: "none",
                color: "#0F172A",
              }}
            />
            <button
              disabled={!texto.trim()}
              onClick={() => {
                onAcao({ tipo: "comentario", texto, autorId: null, autorNome: "" });
                fechar();
              }}
              style={{ ...btnPop, width: "100%", marginTop: 6, opacity: texto.trim() ? 1 : 0.5 }}
            >
              Comentar em {quantos}
            </button>
          </div>
        )}
      </div>

      {/* Acompanhamento */}
      <button
        disabled={nada}
        onClick={() => onAcao({ tipo: "acompanhamento", ligado: true })}
        style={btnLote}
        title="Ligar acompanhamento semanal nos selecionados"
      >
        <CalendarClock size={12} /> Acompanhar
      </button>

      <span style={{ width: 1, height: 20, background: "#334155" }} />
      <button
        onClick={onSair}
        style={{ ...btnLote, background: "transparent" }}
        title="Sair do modo seleção"
      >
        <X size={13} />
      </button>
    </div>
  );
}

const btnLote: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "#1E293B",
  border: "1px solid #334155",
  borderRadius: 8,
  color: "#fff",
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};
const popLote: CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  left: 0,
  zIndex: 600,
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 10,
  boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
  minWidth: 190,
  overflow: "hidden",
};
const itemPop: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "8px 12px",
  background: "transparent",
  border: "none",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
};
const btnPop: CSSProperties = {
  background: "#0DD3C5",
  border: "none",
  borderRadius: 7,
  color: "#fff",
  padding: "7px 12px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  flex: 1,
};
const btnPopSec: CSSProperties = {
  background: "#F1F5F9",
  border: "1px solid #E2E8F0",
  borderRadius: 7,
  color: "#475569",
  padding: "7px 12px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  flex: 1,
};

// ─── Filter logic / prazo helpers ────────────────────────────────────────────
/** Nome comparável: sem acento, sem caixa, sem espaço sobrando. */
function chaveDeNome(nome: string): string {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function filterCards(cards: FlatCard[], f: Filters): FlatCard[] {
  return cards.filter((c) => {
    if (f.modulo !== "ambos" && c.modulo !== f.modulo) return false;
    if (f.busca) {
      // Procura onde a pessoa lembraria de procurar: o nome do card, de quem é
      // e em que pasta está, mais as etiquetas.
      const alvo = chaveDeNome(
        [c.itemNome, c.clienteNome, c.planoNome, (c.etiquetas || []).join(" ")].join(" "),
      );
      if (!alvo.includes(chaveDeNome(f.busca))) return false;
    }
    if (f.clientes.length && !f.clientes.includes(chaveDeNome(c.clienteNome))) return false;
    if (f.planos.length && !f.planos.includes(chaveDeNome(c.planoNome))) return false;
    if (f.responsaveis.length && !c.responsaveis.some((id) => f.responsaveis.includes(id)))
      return false;
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

function prazoStatus(iso: string): {
  bucket: "atrasado" | "hoje" | "semana" | "futuro" | "";
  color: string;
} {
  if (!iso) return { bucket: "", color: "#64748B" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { bucket: "", color: "#64748B" };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 86400000);
  if (diff < 0) return { bucket: "atrasado", color: "#DC2626" };
  if (diff === 0) return { bucket: "hoje", color: "#F97316" };
  if (diff <= 7) return { bucket: "semana", color: "#D97706" };
  return { bucket: "futuro", color: "#64748B" };
}

function formatPrazo(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
