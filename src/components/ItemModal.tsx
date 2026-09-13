// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from "react";
import type { CSSProperties } from "react";
import {
  X,
  Check,
  Plus,
  Calendar,
  Users,
  Paperclip,
  Tag,
  Edit3,
  ListChecks,
  Trash2,
  ChevronDown,
  Maximize2,
  Eye,
  MoreHorizontal,
} from "lucide-react";
import { useDashboardState } from "@/lib/useDashboardState";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useProfiles, initials, colorFor } from "@/lib/profiles";
import {
  emitNotifications,
  emitAtribuicao,
  emitMudancaStatus,
  type NotifContext,
} from "@/lib/notifications";
import ResponsaveisPicker from "@/components/ResponsaveisPicker";
import MentionTextarea, { MentionText } from "@/components/MentionTextarea";
import { moduloOf } from "@/lib/areas";
import type {
  Area,
  Cliente,
  Plano,
  Item,
  Produto,
  Comentario,
  ItemChecklist,
  Etiqueta,
  Anexo,
  DashboardState,
} from "@/lib/dashboardTypes";
import { temAcompanhamento } from "@/lib/acompanhamentoSemanal";
import {
  ehAreaComercial,
  ETAPAS,
  etapaDoItem,
  mudarEtapa,
  ehPerdido,
  marcarPerdido,
  reabrirNegocio,
  valorDoItem,
  lerValor,
  formatarValor,
  temperaturaDoItem,
  TEMPERATURAS,
  ORIGENS,
  podeVerValores,
} from "@/lib/comercial";
import { trajetoriaDoItem } from "@/lib/relatorios";
import { interpretarTexto, diferencaDeTexto, temAlgoAFazer, tarefaDeTexto } from "@/lib/comandos";
import { COLUMN_COLORS } from "@/lib/flattenItems";
import {
  enviarAnexo,
  linkTemporario,
  apagarAnexo,
  formatarTamanho,
  TAMANHO_MAXIMO,
} from "@/lib/anexos";

const KANBAN_COLUMNS = [
  "A Fazer",
  "Em Andamento",
  "Pendência Interna",
  "Pendência Cliente",
  "Monitoramento",
  "Finalizado",
  "Suspenso",
] as const;
type KanbanStatus = (typeof KANBAN_COLUMNS)[number];

const STATUS_COLORS: Record<string, string> = {
  "A Fazer": "#64748B",
  "Em Andamento": "#3B82F6",
  "Pendência Interna": "#F59E0B",
  "Pendência Cliente": "#F97316",
  Monitoramento: "#06B6D4",
  Finalizado: "#10B981",
  Suspenso: "#94A3B8",
};

const ETIQUETA_COLORS = [
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

const DEADLINE_ALERT_OPTIONS = [
  { value: "0", label: "No horário" },
  { value: "1", label: "1 dia antes" },
  { value: "3", label: "3 dias antes" },
  { value: "7", label: "7 dias antes" },
  { value: "14", label: "14 dias antes" },
];

function uid() {
  return `_${Math.random().toString(36).slice(2, 9)}`;
}
function todayBR() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
const MODULO_PRODUTOS = "Produtos";
/** id sintetico: produtos moram em data.produtos, nao em data.areas */
const PRODUTOS_AREA_ID = "produtos";
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

function prazoToInputValue(prazo: string) {
  if (!prazo) return "";
  const br = prazo.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}T${br[4] || "09"}:${br[5] || "00"}`;
  }
  const d = new Date(prazo);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatPrazoLabel(prazo: string) {
  const d = new Date(prazo);
  if (!prazo || Number.isNaN(d.getTime())) return prazo || "Sem deadline";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  areaId: string;
  clienteId: string;
  planoId: string;
  itemId: string;
  onClose: () => void;
};

export default function ItemModal({ areaId, clienteId, planoId, itemId, onClose }: Props) {
  const { data, update } = useDashboardState("modal");
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
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showAnexoForm, setShowAnexoForm] = useState(false);
  const [newAnexoName, setNewAnexoName] = useState("");
  const [newAnexoUrl, setNewAnexoUrl] = useState("");
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [erroAnexo, setErroAnexo] = useState("");
  // O valor fica em rascunho enquanto se digita: gravar a cada tecla
  // transformaria "8.5" em oito reais e meio no meio da frase.
  const [valorDraft, setValorDraft] = useState<string | null>(null);
  const [motivoPerda, setMotivoPerda] = useState("");
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const prazoRef = useRef<HTMLInputElement>(null);
  // Store the element that triggered the modal so we can restore focus on close
  const openerRef = useRef<Element | null>(
    typeof document !== "undefined" ? document.activeElement : null,
  );

  // Auto-focus modal and handle ESC + focus trap
  useEffect(() => {
    const openerEl = openerRef.current;

    // Auto-focus the modal container
    if (modalRef.current) {
      modalRef.current.focus();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // Focus trap: keep Tab/Shift+Tab inside the modal
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!focusable.length) {
          e.preventDefault();
          return;
        }

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Restore focus to the element that opened the modal
      if (openerEl && typeof (openerEl as HTMLElement).focus === "function") {
        (openerEl as HTMLElement).focus();
      }
    };
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

  // Um produto guarda seus itens num nivel so, entao faz papel de cliente e de
  // plano ao mesmo tempo.
  const ehProduto = areaId === PRODUTOS_AREA_ID;
  const produto = ehProduto ? data.produtos?.find((p: Produto) => p.id === clienteId) : null;

  const area = ehProduto
    ? { id: PRODUTOS_AREA_ID, name: MODULO_PRODUTOS }
    : data.areas?.find((a: Area) => a.id === areaId);
  const cliente = ehProduto ? produto : area?.clientes?.find((c: Cliente) => c.id === clienteId);
  const plano = ehProduto ? produto : cliente?.planos?.find((p: Plano) => p.id === planoId);
  const item = ehProduto
    ? produto?.items?.find((it: Item) => it.id === itemId)
    : plano?.items?.find((it: Item) => it.id === itemId);

  if (!item || !plano || !cliente || !area) return null;

  const modulo = ehProduto ? MODULO_PRODUTOS : moduloOf(areaId);
  const kanbanStatus: KanbanStatus = item.kanbanStatus || "A Fazer";
  const statusColor = STATUS_COLORS[kanbanStatus] || "#64748B";
  const checklist: ItemChecklist[] = item.checklist || [];
  const checkDone = checklist.filter((ck) => ck.done).length;
  const checkPct = checklist.length ? Math.round((checkDone / checklist.length) * 100) : 0;
  const avisoPrazoDias = String(item.avisoPrazoDias ?? 3);
  const acompanhando = temAcompanhamento(item);
  // Campos que so existem no Comercial: um item la e um negocio.
  const ehNegocio = ehAreaComercial(areaId);
  const verValores = podeVerValores(currentProfile);
  const etapaAtual = etapaDoItem(item);
  const negocioPerdido = ehPerdido(item);
  // Trajetória do card: por quais etapas passou e quanto tempo em cada. Um
  // status pode repetir — é justamente a ida e volta que interessa enxergar.
  const trajetoria = trajetoriaDoItem(
    {
      ...item,
      status: item.kanbanStatus || item.status || "A Fazer",
      statusHistory: item.statusHistory || [],
    } as never,
    new Date(),
  );
  const diasNaEtapaAtual = trajetoria.find((e) => e.atual)?.dias ?? null;
  const allActivity: Comentario[] = (item.comentarios || [])
    .slice()
    .sort((a: Comentario, b: Comentario) => (a.created_at || "").localeCompare(b.created_at || ""));

  const ctx: NotifContext = {
    cliente_id: clienteId,
    cliente_nome: cliente.name,
    modulo,
    plano_id: planoId,
    plano_nome: plano.name,
    item_id: itemId,
    item_nome: item.name,
    autor_id: currentUser?.id || null,
    autor_nome: currentProfile?.display_name || currentUser?.email || "sistema",
    trecho: "",
  };

  function patchItem(patch: Partial<Item>) {
    if (ehProduto) {
      update((prev: DashboardState) => ({
        ...prev,
        produtos: (prev.produtos || []).map((p: Produto) =>
          p.id !== clienteId
            ? p
            : {
                ...p,
                items: (p.items || []).map((it: Item) =>
                  it.id !== itemId ? it : { ...it, ...patch },
                ),
              },
        ),
      }));
      return;
    }
    update((prev: DashboardState) => ({
      ...prev,
      areas: prev.areas.map((a: Area) =>
        a.id !== areaId
          ? a
          : {
              ...a,
              clientes: a.clientes.map((c: Cliente) =>
                c.id !== clienteId
                  ? c
                  : {
                      ...c,
                      planos: c.planos.map((p: Plano) =>
                        p.id !== planoId
                          ? p
                          : {
                              ...p,
                              items: (p.items || []).map((it: Item) =>
                                it.id !== itemId ? it : { ...it, ...patch },
                              ),
                            },
                      ),
                    },
              ),
            },
      ),
    }));
  }

  // Legacy status map so existing code that reads item.status still works
  const LEGACY_STATUS_MAP: Record<KanbanStatus, string> = {
    "A Fazer": "Não iniciado",
    "Em Andamento": "Em andamento",
    "Pendência Interna": "Planejamento",
    "Pendência Cliente": "Pausado",
    Monitoramento: "Em andamento",
    Finalizado: "Concluído",
    Suspenso: "Pausado",
  };

  function changeStatus(s: KanbanStatus) {
    patchItem({ kanbanStatus: s, status: LEGACY_STATUS_MAP[s] });
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
    emitAtribuicao({
      newIds: ids,
      oldIds: old,
      ctx: { ...ctx, trecho: "foi atribuído(a) ao item" },
    });
    setShowMembros(false);
  }

  function addComment() {
    const txt = commentDraft.trim();
    if (!txt) return;
    const meName = currentProfile?.display_name || "Usuário";
    const entry = {
      id: `cm${uid()}`,
      tipo: "comentario",
      date: todayBR(),
      created_at: new Date().toISOString(),
      text: txt,
      autor_id: currentUser?.id || null,
      autor_nome: meName,
    };
    const cmd = interpretarTexto(txt, profiles);
    // O comando não fica no texto salvo: já foi executado, virou ruído.
    patchItem({ comentarios: [...(item.comentarios || []), { ...entry, text: cmd.textoLimpo }] });
    setCommentDraft("");

    if (cmd.ehTarefa) criarTarefaDoTexto(cmd, entry.id);
    if (currentUser) {
      emitNotifications({
        ctx: { ...ctx, trecho: cmd.textoLimpo },
        mentionedIds: cmd.mencionados,
        responsibleIds: item.responsaveis || [],
      });
    }
  }

  /**
   * Texto livre que foi editado e salvo: descrição, comentário corrigido.
   *
   * Só reage ao que mudou nesta edição — quem já estava mencionado antes não
   * é avisado de novo, e o !task só roda quando acabou de ser escrito.
   */
  function confirmarTexto(
    depois: string,
    antes: string,
    opts: {
      trecho?: string;
      origemId?: string;
      permitirTarefa?: boolean;
      /** Regrava o texto sem o comando, depois que ele foi executado. */
      aoLimpar?: (textoLimpo: string) => void;
    } = {},
  ) {
    const cmd = diferencaDeTexto(antes, depois, profiles);
    if (!temAlgoAFazer(cmd)) return;
    if (cmd.ehTarefa && opts.permitirTarefa !== false) {
      criarTarefaDoTexto(cmd, opts.origemId);
      if (cmd.textoLimpo !== depois) opts.aoLimpar?.(cmd.textoLimpo);
    }
    if (currentUser && cmd.mencionados.length) {
      emitNotifications({
        ctx: { ...ctx, trecho: opts.trecho || cmd.textoLimpo },
        mentionedIds: cmd.mencionados,
        responsibleIds: [],
      });
    }
  }

  /**
   * Cria um card irmão a partir de um texto com !task.
   *
   * Nasce no mesmo plano do card de origem: é o lugar onde a pessoa vai
   * procurar. Produtos guardam itens num nível só, então lá o irmão entra no
   * próprio produto.
   */
  function criarTarefaDoTexto(cmd: ReturnType<typeof interpretarTexto>, origemId?: string) {
    const nova = tarefaDeTexto(cmd, currentUser?.id || null, {
      descricaoOrigem: `criada a partir de "${item.name}"`,
      origemId,
    });

    update((prev: DashboardState) => {
      if (ehProduto) {
        return {
          ...prev,
          produtos: (prev.produtos || []).map((p: Produto) =>
            p.id !== clienteId ? p : { ...p, items: [...(p.items || []), nova] },
          ),
        };
      }
      return {
        ...prev,
        areas: (prev.areas || []).map((a: Area) =>
          a.id !== areaId
            ? a
            : {
                ...a,
                clientes: (a.clientes || []).map((c: Cliente) =>
                  c.id !== clienteId
                    ? c
                    : {
                        ...c,
                        planos: (c.planos || []).map((pl: Plano) =>
                          pl.id !== planoId ? pl : { ...pl, items: [...(pl.items || []), nova] },
                        ),
                      },
                ),
              },
        ),
      };
    });

    // Quem recebeu a tarefa precisa saber que ela existe.
    emitAtribuicao({
      newIds: nova.responsaveis || [],
      oldIds: [],
      ctx: {
        ...ctx,
        item_id: nova.id,
        item_nome: nova.name,
        trecho: `Nova tarefa criada a partir de um comentário em "${item.name}"`,
      },
    });
  }

  /**
   * O botão que faz o mesmo que o !task.
   *
   * A sintaxe serve para quem já pegou o jeito e escreve tudo de uma vez; o
   * botão serve para quem não sabe que ela existe, e para o comentário que
   * só depois virou tarefa.
   */
  function virarTarefa(c: Comentario) {
    const cmd = interpretarTexto(c.text || "", profiles);
    criarTarefaDoTexto({ ...cmd, ehTarefa: true }, c.id);
  }

  function startEditComment(comment: Comentario) {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.text || "");
  }

  function saveCommentEdit() {
    const txt = editingCommentText.trim();
    if (!editingCommentId || !txt) return;
    const antes = (item.comentarios || []).find((c: Comentario) => c.id === editingCommentId);
    const cmd = diferencaDeTexto(antes?.text || "", txt, profiles);
    patchItem({
      comentarios: (item.comentarios || []).map((c: Comentario) =>
        c.id === editingCommentId
          ? { ...c, text: cmd.textoLimpo, updated_at: new Date().toISOString() }
          : c,
      ),
    });
    setEditingCommentId(null);
    setEditingCommentText("");
    // Mencionar alguém ao corrigir um comentário avisa igual: o texto mudou
    // depois que a pessoa já leu (ou nem leu) o original.
    confirmarTexto(txt, antes?.text || "", { origemId: editingCommentId });
  }

  function deleteComment(id: string) {
    patchItem({ comentarios: (item.comentarios || []).filter((c: Comentario) => c.id !== id) });
  }

  function addAnexo() {
    const url = newAnexoUrl.trim();
    if (!url) return;
    patchItem({
      anexos: [
        ...(item.anexos || []),
        {
          id: `an${uid()}`,
          name: newAnexoName.trim() || url,
          url,
          created_at: new Date().toISOString(),
        },
      ],
    });
    setNewAnexoName("");
    setNewAnexoUrl("");
    setShowAnexoForm(false);
  }

  async function enviarArquivo(arquivo: File) {
    if (!arquivo) return;
    setErroAnexo("");
    setEnviandoAnexo(true);
    const r = await enviarAnexo(arquivo, itemId, {
      id: currentUser?.id || null,
      nome: currentProfile?.display_name || currentUser?.email || "sistema",
    });
    setEnviandoAnexo(false);
    if (!r.ok) {
      setErroAnexo(r.erro);
      return;
    }
    patchItem({
      anexos: [
        ...(item.anexos || []),
        {
          id: r.anexo.id,
          name: r.anexo.nome,
          caminho: r.anexo.caminho,
          tamanho: r.anexo.tamanho,
          tipo: r.anexo.tipo,
          created_at: r.anexo.enviadoEm,
          autor_id: r.anexo.autorId,
          autor_nome: r.anexo.autorNome,
        },
      ],
    });
    setShowAnexoForm(false);
  }

  /** O arquivo e privado: abre por link assinado, gerado na hora. */
  async function abrirAnexo(anexo: Anexo) {
    if (!anexo.caminho) {
      if (anexo.url) window.open(anexo.url, "_blank", "noreferrer");
      return;
    }
    const url = await linkTemporario(anexo.caminho);
    if (url) window.open(url, "_blank", "noreferrer");
    else setErroAnexo("Não consegui gerar o link do arquivo. Tente de novo.");
  }

  async function removeAnexo(id: string) {
    const anexo = (item.anexos || []).find((a: Anexo) => a.id === id);
    // Tira da lista mesmo que o storage falhe: ficar preso na tela e pior que
    // um arquivo orfao no bucket.
    if (anexo?.caminho) await apagarAnexo(anexo.caminho);
    patchItem({ anexos: (item.anexos || []).filter((a: Anexo) => a.id !== id) });
  }

  function addCheckItem() {
    const txt = newCheckItem.trim();
    if (!txt) return;
    patchItem({ checklist: [...checklist, { id: `ck${uid()}`, text: txt, done: false }] });
    setNewCheckItem("");
  }

  function toggleCheck(id: string) {
    patchItem({
      checklist: checklist.map((ck) => (ck.id !== id ? ck : { ...ck, done: !ck.done })),
    });
  }

  function deleteCheck(id: string) {
    patchItem({ checklist: checklist.filter((ck) => ck.id !== id) });
  }

  function addEtiqueta() {
    if (!newEtiquetaLabel.trim()) return;
    patchItem({
      etiquetas: [
        ...(item.etiquetas || []),
        { id: `et${uid()}`, label: newEtiquetaLabel.trim(), color: newEtiquetaColor },
      ],
    });
    setNewEtiquetaLabel("");
    setShowEtiquetaForm(false);
  }

  function removeEtiqueta(id: string) {
    patchItem({ etiquetas: (item.etiquetas || []).filter((e: Etiqueta) => e.id !== id) });
  }

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.6)",
        zIndex: 2000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "48px 20px 20px",
        overflowY: "auto",
        fontFamily: "Outfit, sans-serif",
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={item?.name || "Item"}
        tabIndex={-1}
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 880,
          boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
          display: "flex",
          flexDirection: "column",
          outline: "none",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 20px 14px",
            borderBottom: "1px solid #F1F5F9",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#94A3B8",
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 6,
              }}
            >
              {plano.name}
            </div>
            <input
              value={item.name}
              onChange={(e) => patchItem({ name: e.target.value })}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                outline: "none",
                fontSize: 20,
                fontWeight: 900,
                color: "#0F172A",
                fontFamily: "inherit",
                padding: 0,
              }}
            />
          </div>
          <div
            style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0, paddingTop: 4 }}
          >
            <button title="Maximizar" style={iconBtn}>
              <Maximize2 size={15} color="#94A3B8" />
            </button>
            <button title="Visualizar" style={iconBtn}>
              <Eye size={15} color="#94A3B8" />
            </button>
            <button title="Opções" style={iconBtn}>
              <MoreHorizontal size={15} color="#94A3B8" />
            </button>
            <button onClick={onClose} style={{ ...iconBtn, marginLeft: 4 }} title="Fechar">
              <X size={17} color="#475569" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: "flex", minHeight: 480 }}>
          {/* ── Left column ── */}
          <div
            style={{
              flex: 1,
              padding: "20px 24px",
              overflowY: "auto",
              borderRight: "1px solid #F1F5F9",
            }}
          >
            {/* Action buttons */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 22 }}>
              <div style={{ position: "relative" }}>
                <ActionBtn
                  icon={<Plus size={12} />}
                  label="Adicionar"
                  onClick={() => setShowQuickAdd((o) => !o)}
                />
                {showQuickAdd && (
                  <div style={floatingMenuStyle}>
                    <QuickAddButton
                      icon={<Users size={12} />}
                      label="Membros"
                      onClick={() => {
                        setShowMembros(true);
                        setShowQuickAdd(false);
                      }}
                    />
                    <QuickAddButton
                      icon={<Calendar size={12} />}
                      label="Data"
                      onClick={() => {
                        setShowQuickAdd(false);
                        prazoRef.current?.focus();
                      }}
                    />
                    <QuickAddButton
                      icon={<Tag size={12} />}
                      label="Etiqueta"
                      onClick={() => {
                        setShowEtiquetaForm(true);
                        setShowQuickAdd(false);
                      }}
                    />
                    <QuickAddButton
                      icon={<Check size={12} />}
                      label="Checklist"
                      onClick={() => {
                        setShowCheckForm(true);
                        setShowQuickAdd(false);
                      }}
                    />
                    <QuickAddButton
                      icon={<Paperclip size={12} />}
                      label="Anexo"
                      onClick={() => {
                        setShowAnexoForm(true);
                        setShowQuickAdd(false);
                      }}
                    />
                  </div>
                )}
              </div>
              <ActionBtn
                icon={<Calendar size={12} />}
                label="Datas"
                onClick={() => prazoRef.current?.focus()}
                active={!!item.prazo}
              />
              <ActionBtn
                icon={<Check size={12} />}
                label="Checklist"
                onClick={() => setShowCheckForm(true)}
                active={checklist.length > 0}
              />
              <div style={{ position: "relative" }}>
                <ActionBtn
                  icon={<Users size={12} />}
                  label="Membros"
                  onClick={() => setShowMembros((o) => !o)}
                  active={(item.responsaveis || []).length > 0}
                />
                {showMembros && (
                  <div
                    style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 300 }}
                  >
                    <ResponsaveisPicker
                      value={item.responsaveis || []}
                      onChange={changeResponsaveis}
                    />
                  </div>
                )}
              </div>
              <ActionBtn
                icon={<Paperclip size={12} />}
                label="Anexo"
                onClick={() => setShowAnexoForm((o) => !o)}
                active={(item.anexos || []).length > 0}
              />
            </div>

            {/* Status + Prazo */}
            <div
              style={{
                display: "flex",
                gap: 16,
                marginBottom: 22,
                flexWrap: "wrap",
                alignItems: "flex-end",
              }}
            >
              <div ref={statusMenuRef} style={{ position: "relative" }}>
                <Label>Status</Label>
                <button
                  onClick={() => setShowStatusMenu((o) => !o)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "7px 12px",
                    background: `${statusColor}15`,
                    border: `1.5px solid ${statusColor}50`,
                    borderRadius: 8,
                    color: statusColor,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: statusColor,
                      flexShrink: 0,
                    }}
                  />
                  {kanbanStatus} <ChevronDown size={12} />
                </button>
                {showStatusMenu && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      zIndex: 200,
                      background: "#fff",
                      border: "1px solid #E2E8F0",
                      borderRadius: 10,
                      boxShadow: "0 8px 30px rgba(0,0,0,0.14)",
                      minWidth: 210,
                      overflow: "hidden",
                    }}
                  >
                    {KANBAN_COLUMNS.map((s) => {
                      const sc = STATUS_COLORS[s];
                      return (
                        <button
                          key={s}
                          onClick={() => changeStatus(s)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 9,
                            width: "100%",
                            padding: "9px 14px",
                            background: s === kanbanStatus ? `${sc}12` : "transparent",
                            border: "none",
                            color: sc,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            textAlign: "left",
                          }}
                        >
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: sc,
                              flexShrink: 0,
                            }}
                          />
                          {s}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ minWidth: 220 }}>
                <Label>Deadline</Label>
                <input
                  ref={prazoRef}
                  type="datetime-local"
                  value={prazoToInputValue(item.prazo || "")}
                  onChange={(e) => patchItem({ prazo: e.target.value })}
                  style={{ ...fieldStyle, width: 220 }}
                />
                {item.prazo && (
                  <div style={{ marginTop: 4, fontSize: 10, color: "#64748B" }}>
                    {formatPrazoLabel(item.prazo)}
                  </div>
                )}
              </div>

              <div>
                <Label>Aviso</Label>
                <select
                  value={avisoPrazoDias}
                  onChange={(e) => patchItem({ avisoPrazoDias: Number(e.target.value) })}
                  style={{ ...fieldStyle, width: 130 }}
                >
                  {DEADLINE_ALERT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Acompanhamento semanal: opt-in por card, para o registro
                  automatico aparecer so onde alguem esta de olho. */}
              {diasNaEtapaAtual !== null && (
                <div>
                  <Label>Nesta etapa</Label>
                  <div
                    style={{
                      marginTop: 5,
                      padding: "7px 12px",
                      borderRadius: 8,
                      whiteSpace: "nowrap",
                      fontSize: 12,
                      fontWeight: 700,
                      background:
                        diasNaEtapaAtual >= 14
                          ? "#FEF2F2"
                          : diasNaEtapaAtual >= 7
                            ? "#FFFBEB"
                            : "#F8FAFC",
                      border: `1px solid ${
                        diasNaEtapaAtual >= 14
                          ? "#FECACA"
                          : diasNaEtapaAtual >= 7
                            ? "#FDE68A"
                            : "#E2E8F0"
                      }`,
                      color:
                        diasNaEtapaAtual >= 14
                          ? "#DC2626"
                          : diasNaEtapaAtual >= 7
                            ? "#B45309"
                            : "#64748B",
                    }}
                  >
                    {diasNaEtapaAtual < 1
                      ? "hoje"
                      : `${Math.round(diasNaEtapaAtual)} dia${Math.round(diasNaEtapaAtual) !== 1 ? "s" : ""}`}
                  </div>
                </div>
              )}

              <div>
                <Label>Acompanhar</Label>
                <button
                  onClick={() => patchItem({ acompanhamentoSemanal: !acompanhando })}
                  title={
                    acompanhando
                      ? "Toda segunda o sistema registra um comentário com a situação deste card"
                      : "Ligar para receber um comentário automático toda segunda"
                  }
                  style={{
                    marginTop: 5,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: `1.5px solid ${acompanhando ? "#0DD3C5" : "#E2E8F0"}`,
                    background: acompanhando ? "#F0FDFA" : "#F8FAFC",
                    color: acompanhando ? "#0F766E" : "#64748B",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 26,
                      height: 15,
                      borderRadius: 999,
                      background: acompanhando ? "#0DD3C5" : "#CBD5E1",
                      position: "relative",
                      flexShrink: 0,
                      transition: "background .15s",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        left: acompanhando ? 13 : 2,
                        width: 11,
                        height: 11,
                        borderRadius: "50%",
                        background: "#fff",
                        transition: "left .15s",
                      }}
                    />
                  </span>
                  Semanal
                </button>
              </div>

              {(item.responsaveis || []).length > 0 && (
                <div>
                  <Label>Responsáveis</Label>
                  <div style={{ display: "inline-flex", paddingTop: 2 }}>
                    {(item.responsaveis || []).map((id: string, i: number) => {
                      const p = profiles.find((x) => x.id === id);
                      if (!p) return null;
                      return (
                        <span
                          key={id}
                          title={p.display_name}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 30,
                            height: 30,
                            borderRadius: "50%",
                            background: p.avatar_color || colorFor(p.id),
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: 800,
                            marginLeft: i === 0 ? 0 : -8,
                            border: "2px solid #fff",
                          }}
                        >
                          {initials(p.display_name)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Etiquetas */}
            <div style={{ marginBottom: 22 }}>
              <Label>Etiquetas</Label>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  alignItems: "center",
                  marginTop: 6,
                }}
              >
                {(item.etiquetas || []).map((et: Etiqueta) => (
                  <span
                    key={et.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "4px 10px",
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 700,
                      background: `${et.color}20`,
                      color: et.color,
                      border: `1px solid ${et.color}40`,
                    }}
                  >
                    {et.label}
                    <button
                      onClick={() => removeEtiqueta(et.id)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: et.color,
                        padding: 0,
                        lineHeight: 1,
                        display: "flex",
                      }}
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
                <button
                  onClick={() => setShowEtiquetaForm((o) => !o)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 10px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    background: "#F1F5F9",
                    border: "1px solid #E2E8F0",
                    color: "#64748B",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <Plus size={10} /> Etiqueta
                </button>
              </div>
              {showEtiquetaForm && (
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    autoFocus
                    value={newEtiquetaLabel}
                    onChange={(e) => setNewEtiquetaLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addEtiqueta()}
                    placeholder="Nome da etiqueta..."
                    style={fieldStyle}
                  />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {ETIQUETA_COLORS.map((c) => (
                      <button
                        key={c}
                        title={c}
                        onClick={() => setNewEtiquetaColor(c)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          background: c,
                          border:
                            c === newEtiquetaColor
                              ? "3px solid #0F172A"
                              : "2px solid rgba(15,23,42,0.08)",
                          cursor: "pointer",
                          boxShadow: c === newEtiquetaColor ? `0 0 0 3px ${c}30` : "none",
                        }}
                      />
                    ))}
                  </div>
                  <button onClick={addEtiqueta} style={primaryBtn}>
                    Adicionar
                  </button>
                </div>
              )}
            </div>

            {/* Trajetória: por quais etapas o card passou e quanto tempo em
                cada uma. Um status pode repetir — é a ida e volta que revela
                onde o processo trava. */}
            {trajetoria.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <Label>Trajetória</Label>
                <div style={{ marginTop: 8 }}>
                  {(() => {
                    const total = trajetoria.reduce((acc, e) => acc + e.dias, 0) || 1;
                    return (
                      <>
                        <div
                          style={{
                            display: "flex",
                            height: 8,
                            borderRadius: 4,
                            overflow: "hidden",
                            background: "#F1F5F9",
                            marginBottom: 8,
                          }}
                        >
                          {trajetoria.map((e, i) => (
                            <span
                              key={i}
                              title={`${e.status}: ${e.dias.toFixed(1)} dias`}
                              style={{
                                width: `${(e.dias / total) * 100}%`,
                                background: COLUMN_COLORS[e.status] || "#94A3B8",
                                opacity: e.atual ? 1 : 0.75,
                              }}
                            />
                          ))}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {trajetoria.map((e, i) => (
                            <div
                              key={i}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                fontSize: 11.5,
                              }}
                            >
                              <span
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: "50%",
                                  flexShrink: 0,
                                  background: COLUMN_COLORS[e.status] || "#94A3B8",
                                }}
                              />
                              <span
                                style={{
                                  color: "#0F172A",
                                  fontWeight: e.atual ? 800 : 600,
                                  flex: 1,
                                }}
                              >
                                {e.status}
                                {e.atual && (
                                  <span style={{ color: "#0DD3C5", fontWeight: 700 }}>
                                    {" "}
                                    · agora
                                  </span>
                                )}
                              </span>
                              <span style={{ color: "#64748B", fontWeight: 700 }}>
                                {e.dias < 1 ? "menos de 1 dia" : `${Math.round(e.dias)}d`}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div
                          style={{
                            fontSize: 10.5,
                            color: "#94A3B8",
                            marginTop: 6,
                            paddingTop: 6,
                            borderTop: "1px solid #F1F5F9",
                          }}
                        >
                          {Math.round(total)} dias desde a criação ·{" "}
                          {trajetoria.length === 1
                            ? "sem mudança de etapa ainda"
                            : `${trajetoria.length - 1} mudança${trajetoria.length - 1 !== 1 ? "s" : ""} de etapa`}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {ehNegocio && (
              <div
                style={{
                  marginBottom: 22,
                  padding: 14,
                  background: negocioPerdido ? "#FEF2F2" : "#F8FAFC",
                  border: `1px solid ${negocioPerdido ? "#FECACA" : "#E2E8F0"}`,
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#94A3B8",
                      textTransform: "uppercase",
                      letterSpacing: 0.7,
                    }}
                  >
                    Negócio
                  </span>
                  {negocioPerdido ? (
                    <button
                      onClick={() => patchItem(reabrirNegocio(item))}
                      style={{ ...ghostBtn, color: "#0891B2" }}
                    >
                      Reabrir negócio
                    </button>
                  ) : (
                    <button
                      onClick={() => setPedindoMotivo((v) => !v)}
                      style={{ ...ghostBtn, color: "#DC2626" }}
                    >
                      Marcar como perdido
                    </button>
                  )}
                </div>

                {negocioPerdido && (
                  <p style={{ fontSize: 12, color: "#B91C1C", marginBottom: 12 }}>
                    Perdido{item.motivoPerda ? `: ${item.motivoPerda}` : " (sem motivo registrado)"}
                  </p>
                )}

                {pedindoMotivo && !negocioPerdido && (
                  <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                    <input
                      value={motivoPerda}
                      onChange={(e) => setMotivoPerda(e.target.value)}
                      placeholder="Por que perdemos? (preço, prazo, concorrente...)"
                      style={{ ...fieldStyle, flex: 1 }}
                    />
                    <button
                      onClick={() => {
                        patchItem(marcarPerdido(motivoPerda));
                        setMotivoPerda("");
                        setPedindoMotivo(false);
                      }}
                      style={primaryBtn}
                    >
                      Confirmar
                    </button>
                  </div>
                )}

                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <div>
                    <Label>Etapa</Label>
                    <select
                      value={etapaAtual}
                      onChange={(e) => patchItem(mudarEtapa(item, e.target.value))}
                      style={{ ...fieldStyle, width: 170 }}
                    >
                      {ETAPAS.map((et) => (
                        <option key={et.id} value={et.id}>
                          {et.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  {verValores && (
                    <div>
                      <Label>Valor</Label>
                      <input
                        value={valorDraft ?? (valorDoItem(item) ? String(valorDoItem(item)) : "")}
                        onChange={(e) => setValorDraft(e.target.value)}
                        onBlur={() => {
                          if (valorDraft !== null) patchItem({ valor: lerValor(valorDraft) });
                          setValorDraft(null);
                        }}
                        placeholder="45000 ou 45k"
                        style={{ ...fieldStyle, width: 140 }}
                      />
                      {valorDoItem(item) > 0 && valorDraft === null && (
                        <div style={{ marginTop: 4, fontSize: 10, color: "#64748B" }}>
                          {formatarValor(valorDoItem(item))}
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <Label>Temperatura</Label>
                    <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
                      {TEMPERATURAS.map((t) => {
                        const ativa = temperaturaDoItem(item) === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={() => patchItem({ temperatura: t.id })}
                            style={{
                              background: ativa ? `${t.cor}18` : "#fff",
                              border: `1px solid ${ativa ? t.cor : "#E2E8F0"}`,
                              color: ativa ? t.cor : "#94A3B8",
                              borderRadius: 8,
                              padding: "6px 11px",
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {t.nome}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <Label>Origem</Label>
                    <select
                      value={typeof item.origem === "string" ? item.origem : ""}
                      onChange={(e) => patchItem({ origem: e.target.value })}
                      style={{ ...fieldStyle, width: 160 }}
                    >
                      <option value="">Não informada</option>
                      {ORIGENS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Descrição */}
            <div style={{ marginBottom: 22 }}>
              <Label>Descrição</Label>
              <MentionTextarea
                value={item.descricao || ""}
                onChange={(value) => patchItem({ descricao: value })}
                onConfirm={(depois, antes) =>
                  confirmarTexto(depois, antes, {
                    trecho: `Mencionou você na descrição de "${item.name}"`,
                    aoLimpar: (limpo) => patchItem({ descricao: limpo }),
                  })
                }
                placeholder="Adicione uma descrição detalhada... use @ para mencionar e !task para virar tarefa"
                rows={3}
              />
            </div>

            {/* Anexos */}
            {((item.anexos || []).length > 0 || showAnexoForm) && (
              <div style={{ marginBottom: 22 }}>
                <Label>Anexos</Label>
                {(item.anexos || []).length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                    {(item.anexos || []).map((anexo: Anexo) => (
                      <div
                        key={anexo.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          background: "#F8FAFC",
                          border: "1px solid #E2E8F0",
                          borderRadius: 8,
                          padding: "7px 9px",
                        }}
                      >
                        <Paperclip size={13} color="#64748B" />
                        <button
                          onClick={() => abrirAnexo(anexo)}
                          title={anexo.caminho ? "Abrir arquivo" : "Abrir link"}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            color: "#0F766E",
                            fontSize: 12,
                            fontWeight: 700,
                            textDecoration: "none",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            background: "none",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            textAlign: "left",
                            fontFamily: "inherit",
                          }}
                        >
                          {anexo.name || anexo.url}
                          {anexo.tamanho ? (
                            <span style={{ color: "#94A3B8", fontWeight: 500, marginLeft: 6 }}>
                              {formatarTamanho(anexo.tamanho)}
                            </span>
                          ) : null}
                        </button>
                        <button
                          onClick={() => removeAnexo(anexo.id)}
                          title="Remover anexo"
                          style={{ ...iconBtn, padding: 3 }}
                        >
                          <X size={13} color="#94A3B8" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {showAnexoForm && (
                  <div style={{ marginTop: 8 }}>
                    {/* Arquivo de verdade, guardado no bucket privado */}
                    <input
                      ref={arquivoRef}
                      type="file"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) enviarArquivo(f);
                      }}
                    />
                    <button
                      onClick={() => arquivoRef.current?.click()}
                      disabled={enviandoAnexo}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: enviandoAnexo ? "#F1F5F9" : "#0DD3C5",
                        color: enviandoAnexo ? "#94A3B8" : "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 14px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: enviandoAnexo ? "default" : "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      <Paperclip size={13} />
                      {enviandoAnexo ? "Enviando…" : "Escolher arquivo"}
                    </button>
                    <span style={{ fontSize: 10.5, color: "#94A3B8", marginLeft: 8 }}>
                      até {formatarTamanho(TAMANHO_MAXIMO)} · PDF, Word, Excel, imagens
                    </span>

                    {erroAnexo && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "7px 10px",
                          borderRadius: 8,
                          background: "#FEF2F2",
                          border: "1px solid #FECACA",
                          color: "#DC2626",
                          fontSize: 11.5,
                          fontWeight: 600,
                        }}
                      >
                        {erroAnexo}
                      </div>
                    )}

                    <div
                      style={{
                        fontSize: 10,
                        color: "#CBD5E1",
                        margin: "12px 0 6px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                      }}
                    >
                      ou cole um link
                    </div>
                  </div>
                )}
                {showAnexoForm && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <input
                      value={newAnexoName}
                      onChange={(e) => setNewAnexoName(e.target.value)}
                      placeholder="Nome do anexo"
                      style={{ ...fieldStyle, flex: "1 1 160px" }}
                    />
                    <input
                      value={newAnexoUrl}
                      onChange={(e) => setNewAnexoUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addAnexo();
                        if (e.key === "Escape") setShowAnexoForm(false);
                      }}
                      placeholder="https://..."
                      style={{ ...fieldStyle, flex: "2 1 220px" }}
                    />
                    <button onClick={addAnexo} style={primaryBtn}>
                      Adicionar
                    </button>
                    <button onClick={() => setShowAnexoForm(false)} style={ghostBtn}>
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Checklist */}
            {(checklist.length > 0 || showCheckForm) && (
              <div style={{ marginBottom: 22 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <Label>
                    Checklist{" "}
                    {checklist.length > 0 && (
                      <span style={{ color: "#0DD3C5", marginLeft: 4 }}>{checkPct}%</span>
                    )}
                  </Label>
                  {checklist.length > 0 && (
                    <span style={{ fontSize: 11, color: "#64748B" }}>
                      {checkDone}/{checklist.length}
                    </span>
                  )}
                </div>
                {checklist.length > 0 && (
                  <div
                    style={{
                      height: 4,
                      background: "#E2E8F0",
                      borderRadius: 2,
                      marginBottom: 10,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${checkPct}%`,
                        height: "100%",
                        background: "#0DD3C5",
                        borderRadius: 2,
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
                  {checklist.map((ck: ItemChecklist) => (
                    <div
                      key={ck.id}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}
                    >
                      <button
                        onClick={() => toggleCheck(ck.id)}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          flexShrink: 0,
                          cursor: "pointer",
                          border: `2px solid ${ck.done ? "#0DD3C5" : "#CBD5E1"}`,
                          background: ck.done ? "#0DD3C5" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {ck.done && <Check size={11} color="#fff" />}
                      </button>
                      <input
                        value={ck.text}
                        onChange={(e) =>
                          patchItem({
                            checklist: checklist.map((c: ItemChecklist) =>
                              c.id !== ck.id ? c : { ...c, text: e.target.value },
                            ),
                          })
                        }
                        style={{
                          flex: 1,
                          background: "none",
                          border: "none",
                          outline: "none",
                          fontSize: 13,
                          fontFamily: "inherit",
                          color: ck.done ? "#94A3B8" : "#0F172A",
                          textDecoration: ck.done ? "line-through" : "none",
                        }}
                      />
                      <button
                        onClick={() => deleteCheck(ck.id)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "#CBD5E1",
                          padding: 2,
                          display: "flex",
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                {showCheckForm ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      autoFocus
                      value={newCheckItem}
                      onChange={(e) => setNewCheckItem(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addCheckItem();
                        if (e.key === "Escape") setShowCheckForm(false);
                      }}
                      placeholder="Novo item..."
                      style={fieldStyle}
                    />
                    <button onClick={addCheckItem} style={primaryBtn}>
                      <Plus size={13} />
                    </button>
                    <button onClick={() => setShowCheckForm(false)} style={ghostBtn}>
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCheckForm(true)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      background: "none",
                      border: "none",
                      color: "#94A3B8",
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <Plus size={12} /> Adicionar item
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Right column — atividade ── */}
          <div
            style={{
              width: 284,
              padding: "20px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              overflowY: "auto",
              background: "#FAFBFC",
              borderRadius: "0 0 16px 0",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#94A3B8",
                textTransform: "uppercase",
                letterSpacing: 0.7,
              }}
            >
              Atividade
            </div>

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
                  <button onClick={addComment} style={primaryBtn}>
                    Salvar
                  </button>
                  <button onClick={() => setCommentDraft("")} style={ghostBtn}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>

            {/* Activity list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {allActivity.length === 0 && (
                <p style={{ fontSize: 12, color: "#CBD5E1", fontStyle: "italic" }}>
                  Sem atividade ainda.
                </p>
              )}
              {allActivity.map((c: Comentario) => {
                const p = profiles.find((x) => x.id === c.autor_id);
                const avatarColor = p ? p.avatar_color || colorFor(p.id) : "#64748B";
                const name = c.autor_nome || "Usuário";
                return (
                  <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        background: avatarColor,
                        color: "#fff",
                        fontSize: 9,
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {p ? initials(p.display_name) : name.slice(0, 2).toUpperCase()}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          alignItems: "baseline",
                          marginBottom: 3,
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>
                          {name}
                        </span>
                        <span style={{ fontSize: 10, color: "#94A3B8" }}>
                          {c.created_at ? timeAgo(c.created_at) : c.date}
                        </span>
                        <button
                          onClick={() => virarTarefa(c)}
                          title="Transformar este comentário em tarefa"
                          style={{ ...miniTextBtn, marginLeft: "auto" }}
                        >
                          <ListChecks size={11} />
                        </button>
                        <button
                          onClick={() => startEditComment(c)}
                          title="Editar comentário"
                          style={miniTextBtn}
                        >
                          <Edit3 size={11} />
                        </button>
                        <button
                          onClick={() => deleteComment(c.id)}
                          title="Excluir comentário"
                          style={miniTextBtn}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                      {editingCommentId === c.id ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <MentionTextarea
                            value={editingCommentText}
                            onChange={setEditingCommentText}
                            onSubmit={saveCommentEdit}
                            rows={3}
                          />
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={saveCommentEdit} style={primaryBtn}>
                              Salvar
                            </button>
                            <button
                              onClick={() => {
                                setEditingCommentId(null);
                                setEditingCommentText("");
                              }}
                              style={ghostBtn}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#475569",
                            background: "#fff",
                            padding: "7px 10px",
                            borderRadius: 8,
                            lineHeight: 1.5,
                            border: "1px solid #F1F5F9",
                          }}
                        >
                          <MentionText text={c.text} />
                        </div>
                      )}
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
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: "#94A3B8",
        textTransform: "uppercase",
        letterSpacing: 0.7,
      }}
    >
      {children}
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "6px 11px",
        borderRadius: 8,
        border: `1px solid ${active ? "#0DD3C580" : "#E2E8F0"}`,
        background: active ? "#F0FDFA" : "#F8FAFC",
        color: active ? "#0F766E" : "#475569",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {icon} {label}
    </button>
  );
}

function QuickAddButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "8px 10px",
        background: "transparent",
        border: "none",
        borderRadius: 6,
        color: "#475569",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: 700,
        textAlign: "left",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

const iconBtn: CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 6,
  borderRadius: 6,
  display: "flex",
  alignItems: "center",
};
const floatingMenuStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  zIndex: 500,
  minWidth: 170,
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 10,
  boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
  padding: 4,
};
const miniTextBtn: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#94A3B8",
  cursor: "pointer",
  padding: 2,
  display: "inline-flex",
  alignItems: "center",
};
const fieldStyle: CSSProperties = {
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
  color: "#0F172A",
  width: 160,
};
const primaryBtn: CSSProperties = {
  background: "#0DD3C5",
  border: "none",
  borderRadius: 8,
  padding: "7px 14px",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};
const ghostBtn: CSSProperties = {
  background: "#F1F5F9",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  color: "#64748B",
  cursor: "pointer",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
};
