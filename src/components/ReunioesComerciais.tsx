// Reuniões comerciais: o registro do que foi conversado e o que virou tarefa.
//
// Substitui as antigas atas comerciais, que moravam escondidas dentro de um
// produto e eram um bloco de texto só. Aqui a reunião tem campos separados —
// o que foi conversado, o que ficou decidido, o que alguém ficou de fazer —
// porque é a última parte que o sistema consegue transformar em card.

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  Plus,
  Trash2,
  ListChecks,
  Users,
  Edit3,
  ChevronDown,
  ChevronRight,
  FileText,
  Wand2,
} from "lucide-react";
import {
  TIPOS_REUNIAO,
  reuniaoVazia,
  reunioesDoComercial,
  salvarReuniao,
  removerReuniao,
  planejarTarefas,
  planejarValidadas,
  aplicarTarefas,
  tarefasDoTexto,
  tarefasDaReuniao,
  resumirReuniao,
  type Reuniao,
  type TipoReuniao,
} from "@/lib/reunioes";
import { empresasDoComercial } from "@/lib/comercial";
import type { DashboardState } from "@/lib/dashboardTypes";
import { useProfiles, initials, colorFor } from "@/lib/profiles";
import { useCurrentUser } from "@/lib/useCurrentUser";
import ResponsaveisPicker from "@/components/ResponsaveisPicker";
import MentionTextarea from "@/components/MentionTextarea";
import ItemModal from "@/components/ItemModal";
import { emitAtribuicao } from "@/lib/notifications";
import { lerTranscricao, dataSugerida, type Sugestao } from "@/lib/transcricao";
import { parseBR } from "@/lib/relatorios";

type Props = {
  data: DashboardState;
  setData: (updater: (d: DashboardState) => DashboardState) => void;
};

export default function ReunioesComerciais({ data, setData }: Props) {
  const profiles = useProfiles();
  const me = useCurrentUser();
  const meuPerfil = me ? profiles.find((p) => p.id === me.id) : null;

  const [editando, setEditando] = useState<Reuniao | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [cardAberto, setCardAberto] = useState<{
    clienteId: string;
    planoId: string;
    itemId: string;
  } | null>(null);
  const [aviso, setAviso] = useState("");

  const reunioes = useMemo(() => reunioesDoComercial(data), [data]);
  const empresas = useMemo(() => empresasDoComercial(data), [data]);
  const nomeEmpresa = (id?: string) => empresas.find((e) => e.id === id)?.nome || "";

  function novaReuniao() {
    setEditando(reuniaoVazia(meuPerfil));
    setAviso("");
  }

  function salvar() {
    if (!editando || !editando.titulo.trim()) return;
    const r = editando;
    setData((d) => salvarReuniao(d, r));
    setEditando(null);
    setAberta(r.id);
  }

  /**
   * Transforma os encaminhamentos em cards.
   *
   * Avisa quem ficou responsável — sem isso a pessoa só descobriria a tarefa
   * abrindo a própria página, que é como as atas antigas funcionavam.
   */
  /**
   * Cria os cards do relatório já conferido.
   *
   * Salva a reunião junto: quem está validando ainda está no formulário, e
   * perder o que foi escrito por causa da ordem dos botões seria burrice.
   */
  function criarValidadas(linhas: LinhaValidacao[]) {
    const r = editando;
    if (!r || !linhas.length) return;

    const plano = planejarValidadas(
      data,
      r,
      linhas.map((l) => ({
        texto: l.texto,
        responsaveis: l.responsaveis,
        dataInicio: l.dataInicio,
        prazo: l.prazo,
        ditoPor: l.falante,
        fraseOriginal: l.fraseOriginal,
      })),
    );
    if (!plano.cards.length) return;

    setData((d) => aplicarTarefas(salvarReuniao(d, r), r, plano));
    avisarResponsaveis(plano.cards, r, plano.alvoId);
    setEditando(null);
    setAberta(r.id);
    setAviso(
      `${plano.cards.length} tarefa(s) criada(s) a partir da transcrição, com os responsáveis avisados.`,
    );
  }

  /** Todo card criado por aqui avisa quem ficou com ele. */
  function avisarResponsaveis(
    cards: { id: string; name?: unknown; responsaveis?: unknown }[],
    r: Reuniao,
    alvoId: string,
  ) {
    for (const card of cards) {
      emitAtribuicao({
        newIds: (card.responsaveis as string[]) || [],
        oldIds: [],
        ctx: {
          cliente_id: alvoId,
          cliente_nome: nomeEmpresa(r.clienteId) || "Reuniões internas",
          modulo: "Comercial",
          plano_id: "",
          plano_nome: "Tarefas de reunião",
          item_id: card.id,
          item_nome: String(card.name),
          autor_id: me?.id || null,
          autor_nome: meuPerfil?.display_name || "sistema",
          trecho: `Encaminhamento da reunião "${r.titulo}"`,
        },
      });
    }
  }

  function gerar(r: Reuniao) {
    // Planeja primeiro, com os dados desta renderizacao: e assim que se sabe
    // quais cards foram criados para avisar os responsaveis. O updater do React
    // roda depois, e la dentro nao da para disparar efeito.
    const plano = planejarTarefas(data, r, profiles);

    if (!plano.cards.length) {
      setAviso(
        plano.repetidas
          ? "Nada novo: todos os encaminhamentos já viraram tarefa."
          : "Não encontrei encaminhamento no texto. Escreva um por linha, começando com hífen.",
      );
      setAberta(r.id);
      return;
    }

    setData((d) => aplicarTarefas(d, r, plano));
    avisarResponsaveis(plano.cards, r, plano.alvoId);

    setAberta(r.id);
    setAviso(
      `${plano.cards.length} tarefa(s) criada(s)` +
        (plano.repetidas ? ` · ${plano.repetidas} já existia(m)` : "") +
        ".",
    );
  }

  return (
    <div style={{ fontFamily: "Outfit, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button onClick={novaReuniao} style={botaoPrincipal}>
          <Plus size={14} /> Nova reunião
        </button>
        <span style={{ fontSize: 11, color: "#94A3B8" }}>
          Interna ou com cliente. O que ficar em &quot;encaminhamentos&quot; vira tarefa.
        </span>
      </div>

      {aviso && (
        <div
          style={{
            background: "#F0FDFA",
            border: "1px solid #99F6E4",
            borderRadius: 10,
            padding: "9px 13px",
            fontSize: 12,
            color: "#0F766E",
            marginBottom: 14,
          }}
        >
          {aviso}
        </div>
      )}

      {editando && (
        <Formulario
          reuniao={editando}
          empresas={empresas}
          profiles={profiles}
          onMudar={setEditando}
          onSalvar={salvar}
          onCancelar={() => setEditando(null)}
          onCriarTarefas={criarValidadas}
        />
      )}

      {reunioes.length === 0 && !editando && (
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
          <strong style={{ color: "#0F172A" }}>Nenhuma reunião registrada.</strong> Use &quot;Nova
          reunião&quot; para guardar o que foi conversado, o que ficou decidido e o que cada um
          ficou de fazer.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {reunioes.map((r) => {
          const tipo = TIPOS_REUNIAO.find((t) => t.id === r.tipo) || TIPOS_REUNIAO[0];
          const expandida = aberta === r.id;
          const tarefas = tarefasDaReuniao(data, r.id);
          const previstas = tarefasDoTexto(r.encaminhamentos || "", profiles).length;
          return (
            <div key={r.id} style={caixa}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <button
                  onClick={() => setAberta(expandida ? null : r.id)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#94A3B8",
                    padding: 2,
                    marginTop: 2,
                  }}
                  title={expandida ? "Recolher" : "Abrir"}
                >
                  {expandida ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>
                      {r.titulo}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        color: tipo.cor,
                        background: `${tipo.cor}15`,
                        borderRadius: 20,
                        padding: "2px 8px",
                      }}
                    >
                      {tipo.nome}
                    </span>
                    <span style={{ fontSize: 11, color: "#94A3B8" }}>{r.data}</span>
                    {r.clienteId && (
                      <span style={{ fontSize: 11, color: "#64748B", fontWeight: 700 }}>
                        · {nomeEmpresa(r.clienteId)}
                      </span>
                    )}
                  </div>

                  {!expandida && (
                    <p style={{ fontSize: 11, color: "#64748B", marginTop: 4, lineHeight: 1.5 }}>
                      {resumirReuniao(r) || "Sem conteúdo ainda."}
                    </p>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                    {(r.participantes || []).map((id) => {
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
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: p.avatar_color || colorFor(p.id),
                            color: "#fff",
                            fontSize: 8,
                            fontWeight: 800,
                          }}
                        >
                          {initials(p.display_name)}
                        </span>
                      );
                    })}
                    {r.externos ? (
                      <span style={{ fontSize: 10, color: "#94A3B8" }}>+ {r.externos}</span>
                    ) : null}
                    <span style={{ fontSize: 10, color: "#94A3B8", marginLeft: "auto" }}>
                      {tarefas.length
                        ? `${tarefas.length} tarefa(s) gerada(s)`
                        : previstas
                          ? `${previstas} encaminhamento(s) sem gerar`
                          : ""}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => gerar(r)}
                    title="Transformar os encaminhamentos em tarefas"
                    style={botaoMini}
                  >
                    <ListChecks size={12} /> Gerar tarefas
                  </button>
                  <button
                    onClick={() => {
                      setEditando(r);
                      setAviso("");
                    }}
                    title="Editar"
                    style={{ ...botaoMini, padding: "5px 8px" }}
                  >
                    <Edit3 size={12} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remover a reunião "${r.titulo}"? As tarefas geradas ficam.`)) {
                        setData((d) => removerReuniao(d, r.id));
                      }
                    }}
                    title="Remover reunião"
                    style={{ ...botaoMini, color: "#DC2626", padding: "5px 8px" }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {expandida && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F1F5F9" }}>
                  <Bloco titulo="O que foi conversado" texto={r.pauta} />
                  <Bloco titulo="O que ficou decidido" texto={r.decisoes} />
                  <Bloco titulo="Encaminhamentos" texto={r.encaminhamentos} />
                  <Bloco titulo="Transcrição" texto={r.transcricao} recolhivel />

                  {tarefas.length > 0 && (
                    <>
                      <Rotulo>Tarefas geradas</Rotulo>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {tarefas.map((t) => (
                          <button
                            key={t.item.id}
                            onClick={() =>
                              setCardAberto({
                                clienteId: t.clienteId,
                                planoId: t.planoId,
                                itemId: t.item.id,
                              })
                            }
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              background: "#F8FAFC",
                              border: "1px solid #E2E8F0",
                              borderRadius: 8,
                              padding: "7px 10px",
                              cursor: "pointer",
                              fontFamily: "inherit",
                              textAlign: "left",
                            }}
                          >
                            <ListChecks size={12} color="#0DD3C5" />
                            <span style={{ fontSize: 12, color: "#0F172A", flex: 1 }}>
                              {String(t.item.name)}
                            </span>
                            <span style={{ fontSize: 10, color: "#94A3B8" }}>
                              {String(t.item.kanbanStatus || "A Fazer")}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {cardAberto && (
        <ItemModal
          areaId="comercial"
          clienteId={cardAberto.clienteId}
          planoId={cardAberto.planoId}
          itemId={cardAberto.itemId}
          onClose={() => setCardAberto(null)}
        />
      )}
    </div>
  );
}

function Formulario({
  reuniao,
  empresas,
  profiles,
  onMudar,
  onSalvar,
  onCancelar,
  onCriarTarefas,
}: {
  reuniao: Reuniao;
  empresas: { id: string; nome: string }[];
  profiles: ReturnType<typeof useProfiles>;
  onMudar: (r: Reuniao) => void;
  onSalvar: () => void;
  onCancelar: () => void;
  onCriarTarefas: (linhas: LinhaValidacao[]) => void;
}) {
  const set = (patch: Partial<Reuniao>) => onMudar({ ...reuniao, ...patch });
  return (
    <div style={{ ...caixa, border: "1px solid #FBCFE8", marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Campo rotulo="Título" largura={280}>
          <input
            value={reuniao.titulo}
            onChange={(e) => set({ titulo: e.target.value })}
            placeholder="Ex.: Kickoff com a TechFin"
            style={{ ...campo, width: 280 }}
          />
        </Campo>
        <Campo rotulo="Data" largura={130}>
          <input
            value={reuniao.data}
            onChange={(e) => set({ data: e.target.value })}
            placeholder="DD/MM/AAAA"
            style={{ ...campo, width: 130 }}
          />
        </Campo>
        <Campo rotulo="Tipo" largura={150}>
          <select
            value={reuniao.tipo}
            onChange={(e) => set({ tipo: e.target.value as TipoReuniao })}
            style={{ ...campo, width: 150 }}
          >
            {TIPOS_REUNIAO.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </Campo>
        {reuniao.tipo === "cliente" && (
          <Campo rotulo="Empresa" largura={200}>
            <select
              value={reuniao.clienteId || ""}
              onChange={(e) => set({ clienteId: e.target.value })}
              style={{ ...campo, width: 200 }}
            >
              <option value="">Selecione…</option>
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <Rotulo>
            <Users size={10} /> Quem participou (do escritório)
          </Rotulo>
          <ResponsaveisPicker
            value={reuniao.participantes || []}
            onChange={(ids: string[]) => set({ participantes: ids })}
            label="Participantes"
          />
        </div>
        <Campo rotulo="Quem participou (de fora)" largura={280}>
          <input
            value={reuniao.externos || ""}
            onChange={(e) => set({ externos: e.target.value })}
            placeholder="Ex.: Dr. Marcos (TechFin), Juliana (financeiro)"
            style={{ ...campo, width: 280 }}
          />
        </Campo>
      </div>

      {/* Transcrição: lê participantes e compromissos, mas não escreve resumo.
          A pessoa revisa cada sugestão antes de qualquer coisa virar card. */}
      <BlocoTranscricao
        valor={reuniao.transcricao || ""}
        profiles={profiles}
        onMudar={(v) => set({ transcricao: v })}
        onUsarParticipantes={(ids, externos) =>
          set({
            participantes: [...new Set([...(reuniao.participantes || []), ...ids])],
            externos: [reuniao.externos, externos.join(", ")].filter(Boolean).join(", "),
          })
        }
        dataReuniao={reuniao.data}
        onCriarTarefas={onCriarTarefas}
        onUsarDecisoes={(linhas) =>
          set({ decisoes: [reuniao.decisoes, linhas].filter((x) => x?.trim()).join("\n") })
        }
      />

      <div style={{ height: 10 }} />
      <Rotulo>O que foi conversado</Rotulo>
      <MentionTextarea
        value={reuniao.pauta || ""}
        onChange={(v: string) => set({ pauta: v })}
        placeholder="Os assuntos que passaram pela mesa..."
        rows={4}
      />

      <div style={{ height: 10 }} />
      <Rotulo>O que ficou decidido</Rotulo>
      <MentionTextarea
        value={reuniao.decisoes || ""}
        onChange={(v: string) => set({ decisoes: v })}
        placeholder="As conclusões, sem o que ainda depende de alguém fazer..."
        rows={3}
      />

      <div style={{ height: 10 }} />
      <Rotulo>Encaminhamentos — um por linha, viram tarefa</Rotulo>
      <MentionTextarea
        value={reuniao.encaminhamentos || ""}
        onChange={(v: string) => set({ encaminhamentos: v })}
        placeholder={
          "- Enviar a proposta revisada @bruno.pacca\n- Agendar retorno para a semana que vem @heitor.lopes"
        }
        rows={5}
      />
      <p style={{ fontSize: 10, color: "#94A3B8", marginTop: 5 }}>
        Quem for marcado com @ vira responsável pela tarefa e recebe o aviso.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={onSalvar} disabled={!reuniao.titulo.trim()} style={botaoPrincipal}>
          Salvar reunião
        </button>
        <button onClick={onCancelar} style={{ ...botaoMini, padding: "8px 14px" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/**
 * Lê a transcrição e oferece o que achou.
 *
 * Nada entra na reunião sem alguém marcar. O que este bloco NÃO faz, de
 * propósito: escrever "o que foi conversado". Resumir exige entender o
 * assunto, e sem IA isso sairia ruim — melhor deixar claro do que fingir.
 */
function BlocoTranscricao({
  valor,
  profiles,
  onMudar,
  onUsarParticipantes,
  onCriarTarefas,
  onUsarDecisoes,
  dataReuniao,
}: {
  valor: string;
  profiles: ReturnType<typeof useProfiles>;
  dataReuniao: string;
  onMudar: (v: string) => void;
  onUsarParticipantes: (ids: string[], externos: string[]) => void;
  onCriarTarefas: (linhas: LinhaValidacao[]) => void;
  onUsarDecisoes: (linhas: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [leu, setLeu] = useState(false);
  const [linhas, setLinhas] = useState<LinhaValidacao[]>([]);
  const [decisoesEscolhidas, setDecisoesEscolhidas] = useState<Set<string>>(new Set());

  const leitura = useMemo(() => lerTranscricao(valor, profiles), [valor, profiles]);
  const alternar = (set2: Set<string>, chave: string) => {
    const n = new Set(set2);
    if (n.has(chave)) n.delete(chave);
    else n.add(chave);
    return n;
  };
  const mudarLinha = (i: number, patch: Partial<LinhaValidacao>) =>
    setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  return (
    <div style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: 10, marginBottom: 12 }}>
      <button
        onClick={() => setAberto((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          padding: 0,
          width: "100%",
        }}
      >
        <FileText size={13} color="#64748B" />
        <span style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>
          Transcrição da reunião
        </span>
        <span style={{ fontSize: 10, color: "#94A3B8" }}>
          {valor.trim() ? `${valor.trim().split(/\s+/).length} palavras` : "opcional"}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#CBD5E1" }}>
          {aberto ? "recolher" : "abrir"}
        </span>
      </button>

      {aberto && (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={valor}
            onChange={(e) => {
              onMudar(e.target.value);
              setLeu(false);
            }}
            placeholder={
              "Cole aqui a transcrição, com quem falou no começo de cada linha:\n\n" +
              "Heitor: bom dia, vamos falar da proposta\n" +
              "Bruno: eu fico de mandar a revisão até sexta"
            }
            rows={8}
            style={{ ...campo, width: "100%", resize: "vertical", lineHeight: 1.5 }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => {
                setLeu(true);
                setLinhas(linhasDeValidacao(leitura.compromissos, dataReuniao));
                setDecisoesEscolhidas(new Set(leitura.decisoes));
              }}
              disabled={!valor.trim()}
              style={{ ...botaoMini, background: valor.trim() ? "#F0FDFA" : "#F8FAFC" }}
            >
              <Wand2 size={12} /> Ler transcrição
            </button>
            <span style={{ fontSize: 10, color: "#94A3B8" }}>
              Acha participantes e compromissos. O resumo em prosa continua seu.
            </span>
          </div>

          {leu && (
            <div style={{ marginTop: 12 }}>
              {leitura.observacoes.map((o) => (
                <p key={o} style={{ fontSize: 11, color: "#92400E", marginBottom: 5 }}>
                  {o}
                </p>
              ))}

              {(leitura.participantes.conhecidos.length > 0 ||
                leitura.participantes.externos.length > 0) && (
                <div style={{ marginBottom: 12 }}>
                  <Rotulo>Quem falou</Rotulo>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {leitura.participantes.conhecidos.map((id) => {
                      const p = profiles.find((x) => x.id === id);
                      return (
                        <span key={id} style={etiqueta}>
                          {p?.display_name || id}
                        </span>
                      );
                    })}
                    {leitura.participantes.externos.map((nome) => (
                      <span
                        key={nome}
                        style={{ ...etiqueta, background: "#F1F5F9", color: "#64748B" }}
                      >
                        {nome} · de fora
                      </span>
                    ))}
                    <button
                      onClick={() =>
                        onUsarParticipantes(
                          leitura.participantes.conhecidos,
                          leitura.participantes.externos,
                        )
                      }
                      style={{ ...botaoMini, marginLeft: 4 }}
                    >
                      Usar como participantes
                    </button>
                  </div>
                </div>
              )}

              {linhas.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <Rotulo>
                    Confira antes de criar ({linhas.filter((l) => l.incluir).length} de{" "}
                    {linhas.length})
                  </Rotulo>
                  <p style={{ fontSize: 10, color: "#94A3B8", marginBottom: 8, lineHeight: 1.5 }}>
                    O responsável é um palpite: eu atribuo a quem falou a frase. Se quem se
                    comprometeu foi outra pessoa, troque aqui — depois de criado, o card é normal e
                    aceita comentário, follow-up e próximo passo.
                  </p>

                  {linhas.map((l, i) => (
                    <div
                      key={l.chave}
                      style={{
                        border: `1px solid ${l.incluir ? "#E2E8F0" : "#F1F5F9"}`,
                        borderRadius: 9,
                        padding: 9,
                        marginBottom: 7,
                        background: l.incluir ? "#fff" : "#FAFBFC",
                        opacity: l.incluir ? 1 : 0.55,
                      }}
                    >
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <input
                          type="checkbox"
                          checked={l.incluir}
                          onChange={() => mudarLinha(i, { incluir: !l.incluir })}
                          title={l.incluir ? "Não criar esta" : "Criar esta"}
                          style={{ marginTop: 8, accentColor: "#EC4899" }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <input
                            value={l.texto}
                            onChange={(e) => mudarLinha(i, { texto: e.target.value })}
                            placeholder="O que precisa ser feito"
                            style={{ ...campo, width: "100%", fontWeight: 600 }}
                          />
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              flexWrap: "wrap",
                              marginTop: 6,
                            }}
                          >
                            <ResponsaveisPicker
                              value={l.responsaveis}
                              onChange={(ids: string[]) => mudarLinha(i, { responsaveis: ids })}
                              compact
                              label="Resp."
                            />
                            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ fontSize: 9, color: "#94A3B8", fontWeight: 700 }}>
                                INÍCIO
                              </span>
                              <input
                                type="date"
                                value={brParaISO(l.dataInicio)}
                                onChange={(e) =>
                                  mudarLinha(i, { dataInicio: isoParaBR(e.target.value) })
                                }
                                style={{ ...campo, width: 132, fontSize: 11 }}
                              />
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ fontSize: 9, color: "#94A3B8", fontWeight: 700 }}>
                                PRAZO
                              </span>
                              <input
                                type="date"
                                value={brParaISO(l.prazo)}
                                onChange={(e) =>
                                  mudarLinha(i, { prazo: isoParaBR(e.target.value) })
                                }
                                style={{ ...campo, width: 132, fontSize: 11 }}
                              />
                            </label>
                          </div>
                          <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 5 }}>
                            {l.falante ? `dito por ${l.falante}` : "sem falante identificado"}
                            {l.prazoDito ? ` · "${l.prazoDito}"` : ""}
                            {l.confianca === "media" ? " · confirme o responsável" : ""}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() => onCriarTarefas(linhas.filter((l) => l.incluir))}
                    disabled={!linhas.some((l) => l.incluir && l.texto.trim())}
                    style={{
                      ...botaoMini,
                      background: linhas.some((l) => l.incluir && l.texto.trim())
                        ? "#EC4899"
                        : "#E2E8F0",
                      color: "#fff",
                      border: "none",
                      padding: "8px 14px",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    <ListChecks size={13} /> Criar {linhas.filter((l) => l.incluir).length}{" "}
                    tarefa(s) e avisar
                  </button>
                </div>
              )}

              {leitura.decisoes.length > 0 && (
                <div>
                  <Rotulo>Frases que soam a decisão ({leitura.decisoes.length})</Rotulo>
                  {leitura.decisoes.map((d) => (
                    <label
                      key={d}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "flex-start",
                        padding: "6px 0",
                        borderBottom: "1px solid #F8FAFC",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={decisoesEscolhidas.has(d)}
                        onChange={() => setDecisoesEscolhidas((s2) => alternar(s2, d))}
                        style={{ marginTop: 3, accentColor: "#EC4899" }}
                      />
                      <span style={{ flex: 1, fontSize: 12, color: "#334155", lineHeight: 1.5 }}>
                        {d}
                      </span>
                    </label>
                  ))}
                  <button
                    onClick={() =>
                      onUsarDecisoes(
                        leitura.decisoes
                          .filter((d) => decisoesEscolhidas.has(d))
                          .map((d) => `- ${d}`)
                          .join("\n"),
                      )
                    }
                    disabled={!decisoesEscolhidas.size}
                    style={{ ...botaoMini, marginTop: 7 }}
                  >
                    Usar {decisoesEscolhidas.size} em &quot;o que ficou decidido&quot;
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Uma linha do relatório: o palpite da leitura, pronto para ser corrigido. */
type LinhaValidacao = {
  chave: string;
  incluir: boolean;
  texto: string;
  responsaveis: string[];
  dataInicio: string;
  prazo: string;
  falante: string;
  prazoDito?: string;
  confianca: "alta" | "media";
  fraseOriginal: string;
};

/**
 * Transforma o que a transcrição sugeriu em linhas editáveis.
 *
 * O início nasce na data da reunião — o compromisso começa quando foi assumido
 * — e o prazo sai do que foi dito em voz alta, quando dá para converter.
 */
function linhasDeValidacao(sugestoes: Sugestao[], dataReuniao: string): LinhaValidacao[] {
  const ref = parseBR(dataReuniao) || new Date();
  return sugestoes.map((s, i) => ({
    chave: `${i}-${s.texto.slice(0, 40)}`,
    incluir: true,
    texto: s.texto,
    responsaveis: s.responsavelId ? [s.responsavelId] : [],
    dataInicio: dataReuniao || "",
    prazo: s.prazo ? dataSugerida(s.prazo, ref) : "",
    falante: s.falante,
    prazoDito: s.prazo,
    confianca: s.confianca,
    fraseOriginal: s.texto,
  }));
}

/** O sistema guarda DD/MM/AAAA; o input de data quer AAAA-MM-DD. */
function brParaISO(br: string) {
  const m = String(br || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}
function isoParaBR(iso: string) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

const etiqueta: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#0F766E",
  background: "#F0FDFA",
  borderRadius: 20,
  padding: "3px 9px",
};

function Bloco({
  titulo,
  texto,
  recolhivel = false,
}: {
  titulo: string;
  texto?: string;
  /** Transcrição é longa demais para ficar aberta junto do resto. */
  recolhivel?: boolean;
}) {
  const [aberto, setAberto] = useState(!recolhivel);
  if (!texto?.trim()) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      {recolhivel ? (
        <button
          onClick={() => setAberto((v) => !v)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <Rotulo>
            {titulo} · {aberto ? "recolher" : `${texto.trim().split(/\s+/).length} palavras`}
          </Rotulo>
        </button>
      ) : (
        <Rotulo>{titulo}</Rotulo>
      )}
      {aberto && (
        <p
          style={{
            fontSize: 12,
            color: "#334155",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            background: "#F8FAFC",
            borderRadius: 8,
            padding: "9px 11px",
            maxHeight: recolhivel ? 320 : undefined,
            overflowY: recolhivel ? "auto" : undefined,
          }}
        >
          {texto}
        </p>
      )}
    </div>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontWeight: 800,
        color: "#94A3B8",
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginBottom: 5,
      }}
    >
      {children}
    </div>
  );
}

function Campo({
  rotulo,
  largura,
  children,
}: {
  rotulo: string;
  largura: number;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, width: largura }}>
      <span
        style={{
          fontSize: 9,
          fontWeight: 800,
          color: "#94A3B8",
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {rotulo}
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
  background: "#EC4899",
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
