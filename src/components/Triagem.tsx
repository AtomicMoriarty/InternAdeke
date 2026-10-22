// A triagem: dar dono e prazo ao que ainda não tem.
//
// Card sem responsável não aparece no "Eu" de ninguém; card sem prazo não
// entra em alerta, em relatório de atraso nem no calendário. Estão à vista no
// quadro e invisíveis para o sistema ao mesmo tempo.
//
// A tela antiga era uma lista de cem demandas com abas, gráfico de carga e
// barra de seleção ao mesmo tempo. Aqui ela é agrupada — por cliente ou por
// responsável —, porque a decisão quase sempre é do grupo: "tudo da Acme fica
// com a Ana", "o que o Bruno tem precisa de prazo". Cada grupo resolve tudo de
// uma vez no cabeçalho, e aberto mostra as demandas com o campo que falta em
// cada uma, sem caixa de seleção.

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ChevronDown, ChevronRight, ListChecks, Check, Search } from "lucide-react";
import type { DashboardState } from "@/lib/dashboardTypes";
import type { FlatCard } from "@/lib/flattenItems";
import { aplicarEmLote } from "@/lib/edicaoEmLote";
import { pendencias, cargaPorPessoa } from "@/lib/triagem";
import {
  isoParaBR,
  passaNoFiltro,
  porCliente,
  porResponsavel,
  problemasDo,
  SEM_RESPONSAVEL,
  type Filtro,
  type Grupo,
} from "@/lib/triagemGrupos";
import { semAcento } from "@/lib/comum";
import { useProfiles, initials, colorFor, type Profile } from "@/lib/profiles";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { contaDoEscritorio } from "@/lib/importTrello";
import { areaById } from "@/lib/areas";

type Props = {
  data: DashboardState;
  setData: (updater: (d: DashboardState) => DashboardState) => void;
  abrirCard: (card: FlatCard) => void;
};

type Agrupar = "cliente" | "responsavel";

export default function Triagem({ data, setData, abrirCard }: Props) {
  const profiles = useProfiles();
  const eu = useCurrentUser();
  const [agrupar, setAgrupar] = useState<Agrupar>("cliente");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [feito, setFeito] = useState("");

  const escritorio = useMemo(() => contaDoEscritorio(profiles) || "", [profiles]);
  const p = useMemo(() => pendencias(data, escritorio), [data, escritorio]);
  const carga = useMemo(() => cargaPorPessoa(data), [data]);
  const nomeDe = (id: string) => profiles.find((x) => x.id === id)?.display_name || "(quem saiu)";
  const pessoas = profiles.filter((x) => x.id !== escritorio);

  const pendentes = useMemo(
    () => p.ativos.filter((c) => passaNoFiltro(c, "todos", escritorio)),
    [p.ativos, escritorio],
  );
  const semDono = pendentes.filter((c) => problemasDo(c, escritorio).semDono).length;
  const semPrazo = pendentes.filter((c) => problemasDo(c, escritorio).semPrazo).length;

  const grupos = useMemo(() => {
    const lista = pendentes.filter((c) => passaNoFiltro(c, filtro, escritorio));
    const todos =
      agrupar === "cliente"
        ? porCliente(lista, escritorio)
        : porResponsavel(lista, nomeDe, escritorio);
    const termo = semAcento(busca);
    if (!termo) return todos;
    return todos.filter(
      (g) =>
        semAcento(g.nome).includes(termo) ||
        g.cards.some((c) => semAcento(c.itemNome).includes(termo)),
    );
  }, [pendentes, filtro, agrupar, busca, escritorio, profiles]); // eslint-disable-line react-hooks/exhaustive-deps

  function aplicar(cards: FlatCard[], acao: Parameters<typeof aplicarEmLote>[2], resumo: string) {
    if (!cards.length) return;
    setData((d) => aplicarEmLote(d, cards, acao).data);
    setFeito(`${cards.length} ${cards.length === 1 ? "demanda" : "demandas"} ${resumo}`);
  }
  const atribuir = (cards: FlatCard[], id: string) =>
    aplicar(cards, { tipo: "responsaveis", ids: [id], modo: "substituir" }, `com ${nomeDe(id)}`);
  const darPrazo = (cards: FlatCard[], iso: string) => {
    const br = isoParaBR(iso);
    if (br) aplicar(cards, { tipo: "prazo", prazo: br }, `com prazo para ${br}`);
  };

  function alternar(chave: string) {
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });
  }

  const opcoesPessoas = (
    <>
      {pessoas.map((x) => {
        const c = carga.find((y) => y.id === x.id);
        return (
          <option key={x.id} value={x.id}>
            {x.display_name} ({c ? c.ativos : 0} ativas)
          </option>
        );
      })}
    </>
  );

  return (
    <div style={{ fontFamily: "Outfit, sans-serif", maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <ListChecks size={20} color="#B45309" />
        <h2 style={{ color: "#0F172A", fontSize: 20, fontWeight: 800, margin: 0 }}>Triagem</h2>
      </div>
      <p style={{ color: "#64748B", fontSize: 13, margin: "4px 0 16px" }}>
        {pendentes.length
          ? `${pendentes.length} das ${p.ativos.length} demandas ativas não têm responsável ou prazo. Os ${p.suspensos.length} suspensos ficam de fora.`
          : `Tudo certo: as ${p.ativos.length} demandas ativas têm responsável e prazo.`}
      </p>

      {pendentes.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Segmento
              opcoes={[
                ["cliente", "Por cliente"],
                ["responsavel", "Por responsável"],
              ]}
              valor={agrupar}
              onChange={(v) => {
                setAgrupar(v as Agrupar);
                setAbertos(new Set());
              }}
            />
            <Segmento
              opcoes={[
                ["todos", `Tudo (${pendentes.length})`],
                ["semDono", `Sem responsável (${semDono})`],
                ["semPrazo", `Sem prazo (${semPrazo})`],
              ]}
              valor={filtro}
              onChange={(v) => setFiltro(v as Filtro)}
            />
            <span style={{ flex: 1 }} />
            <label style={{ ...campo, display: "flex", alignItems: "center", gap: 6, width: 230 }}>
              <Search size={13} color="#94A3B8" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={agrupar === "cliente" ? "Buscar cliente" : "Buscar pessoa"}
                style={{
                  border: "none",
                  outline: "none",
                  fontSize: 12,
                  fontFamily: "inherit",
                  flex: 1,
                }}
              />
            </label>
          </div>

          {feito && (
            <p style={{ ...ok, margin: "12px 0 0" }}>
              <Check size={13} style={{ verticalAlign: -2 }} /> {feito}
            </p>
          )}

          <div
            style={{
              marginTop: 14,
              border: "1px solid #E2E8F0",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {!grupos.length && (
              <p style={{ padding: 16, fontSize: 13, color: "#64748B", margin: 0 }}>
                Nada neste filtro.
              </p>
            )}
            {grupos.map((g) => (
              <LinhaDoGrupo
                key={g.chave || "_sem"}
                g={g}
                agrupar={agrupar}
                aberto={abertos.has(g.chave)}
                onAlternar={() => alternar(g.chave)}
                escritorio={escritorio}
                ativasDaPessoa={carga.find((c) => c.id === g.chave)?.ativos}
                opcoesPessoas={opcoesPessoas}
                euId={eu?.id}
                profiles={profiles}
                onAtribuir={atribuir}
                onPrazo={darPrazo}
                onAbrir={abrirCard}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LinhaDoGrupo({
  g,
  agrupar,
  aberto,
  onAlternar,
  escritorio,
  ativasDaPessoa,
  opcoesPessoas,
  euId,
  profiles,
  onAtribuir,
  onPrazo,
  onAbrir,
}: {
  g: Grupo<FlatCard>;
  agrupar: Agrupar;
  aberto: boolean;
  onAlternar: () => void;
  escritorio: string;
  ativasDaPessoa?: number;
  opcoesPessoas: React.ReactNode;
  euId?: string;
  profiles: Profile[];
  onAtribuir: (cards: FlatCard[], id: string) => void;
  onPrazo: (cards: FlatCard[], iso: string) => void;
  onAbrir: (c: FlatCard) => void;
}) {
  // As ações do cabeçalho só mexem no que falta: dar dono não tira o dono de
  // quem já tem, e o prazo só vai para quem não tem.
  const semDono = g.cards.filter((c) => problemasDo(c, escritorio).semDono);
  const semPrazo = g.cards.filter((c) => problemasDo(c, escritorio).semPrazo);
  const ehPessoa = agrupar === "responsavel" && g.chave !== SEM_RESPONSAVEL;

  return (
    <div style={{ borderTop: "1px solid #F1F5F9" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          background: "#fff",
        }}
      >
        <button
          onClick={onAlternar}
          style={{
            ...semEstilo,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}
        >
          {aberto ? (
            <ChevronDown size={15} color="#64748B" />
          ) : (
            <ChevronRight size={15} color="#64748B" />
          )}
          {ehPessoa && <Avatar id={g.chave} nome={g.nome} />}
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#0F172A",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {g.nome}
          </span>
          {agrupar === "cliente" && (
            <span style={{ fontSize: 11, color: "#94A3B8", whiteSpace: "nowrap" }}>
              {g.areas.map((a) => areaById(a)?.modulo || a).join(" · ")}
            </span>
          )}
          {ehPessoa && ativasDaPessoa !== undefined && (
            <span style={{ fontSize: 11, color: "#94A3B8", whiteSpace: "nowrap" }}>
              {ativasDaPessoa} ativas no total
            </span>
          )}
        </button>
        {semDono.length > 0 && (
          <Contador cor="#B91C1C" fundo="#FEF2F2" texto={`${semDono.length} sem responsável`} />
        )}
        {semPrazo.length > 0 && (
          <Contador cor="#B45309" fundo="#FFFBEB" texto={`${semPrazo.length} sem prazo`} />
        )}

        {semDono.length > 0 && (
          <select
            value=""
            onChange={(e) => e.target.value && onAtribuir(semDono, e.target.value)}
            style={{ ...campo, width: 150 }}
            title={`Dar responsável às ${semDono.length} sem responsável`}
          >
            <option value="">Atribuir {semDono.length} a…</option>
            {euId && <option value={euId}>Eu mesmo</option>}
            {opcoesPessoas}
          </select>
        )}
        {semPrazo.length > 0 && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "#64748B",
              whiteSpace: "nowrap",
            }}
            title={`O prazo vai para as ${semPrazo.length} demandas sem prazo deste grupo`}
          >
            Prazo p/ {semPrazo.length}
            <input
              type="date"
              value=""
              onChange={(e) => onPrazo(semPrazo, e.target.value)}
              aria-label={`Prazo para as ${semPrazo.length} demandas sem prazo`}
              style={{ ...campo, width: 136 }}
            />
          </label>
        )}
      </div>

      {aberto && (
        <div style={{ background: "#F8FAFC", padding: "4px 14px 10px 39px" }}>
          {g.cards.map((c) => {
            const prob = problemasDo(c, escritorio);
            return (
              <div
                key={c.itemId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 0",
                  borderBottom: "1px solid #EEF2F6",
                }}
              >
                <button
                  onClick={() => onAbrir(c)}
                  style={{ ...semEstilo, flex: 1, minWidth: 0, textAlign: "left" }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: "#0F172A",
                      display: "block",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.itemNome}
                  </span>
                  <span style={{ fontSize: 11, color: "#94A3B8" }}>
                    {agrupar === "responsavel" ? `${c.clienteNome} · ` : ""}
                    {areaById(c.areaId)?.modulo || c.modulo} · {c.etapa || c.kanbanStatus}
                  </span>
                </button>
                <div style={{ display: "flex", gap: 3 }}>
                  {c.responsaveis
                    .filter((id) => id !== escritorio)
                    .map((id) => (
                      <Avatar
                        key={id}
                        id={id}
                        nome={profiles.find((x) => x.id === id)?.display_name || "?"}
                      />
                    ))}
                </div>
                {prob.semDono ? (
                  <select
                    value=""
                    onChange={(e) => e.target.value && onAtribuir([c], e.target.value)}
                    style={{ ...campo, width: 130 }}
                  >
                    <option value="">Atribuir a…</option>
                    {euId && <option value={euId}>Eu mesmo</option>}
                    {profiles
                      .filter((x) => x.id !== escritorio)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.display_name}
                        </option>
                      ))}
                  </select>
                ) : (
                  <span style={{ width: 130 }} />
                )}
                {prob.semPrazo ? (
                  <input
                    type="date"
                    value=""
                    onChange={(e) => onPrazo([c], e.target.value)}
                    aria-label={`Prazo de ${c.itemNome}`}
                    title="Prazo desta demanda"
                    style={{ ...campo, width: 130 }}
                  />
                ) : (
                  <span style={{ width: 130, fontSize: 12, color: "#64748B" }}>{c.prazo}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Segmento({
  opcoes,
  valor,
  onChange,
}: {
  opcoes: [string, string][];
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid #E2E8F0",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {opcoes.map(([v, rotulo], i) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          style={{
            ...semEstilo,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 600,
            background: valor === v ? "#0F172A" : "#fff",
            color: valor === v ? "#fff" : "#475569",
            borderLeft: i ? "1px solid #E2E8F0" : "none",
          }}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );
}

function Contador({ cor, fundo, texto }: { cor: string; fundo: string; texto: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: cor,
        background: fundo,
        borderRadius: 6,
        padding: "2px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {texto}
    </span>
  );
}

function Avatar({ id, nome }: { id: string; nome: string }) {
  return (
    <span
      title={nome}
      style={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: colorFor(id),
        color: "#fff",
        fontSize: 9,
        fontWeight: 800,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {initials(nome)}
    </span>
  );
}

const semEstilo: CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  padding: 0,
};
const campo: CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 7,
  padding: "5px 8px",
  fontSize: 12,
  color: "#0F172A",
  fontFamily: "inherit",
  outline: "none",
};
const ok: CSSProperties = {
  background: "#F0FDF4",
  border: "1px solid #BBF7D0",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12,
  color: "#166534",
};
