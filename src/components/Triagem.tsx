// A passada de triagem: dar dono e prazo ao que ainda não tem.
//
// Depois da importação o sistema ficou com centenas de cards que ninguém
// precisa criar de novo — mas que ele também não consegue cobrar. Card sem
// responsável não aparece no "Eu" de ninguém; card sem prazo não entra em
// alerta, em relatório de atraso nem na linha do tempo. Estão à vista no
// quadro e invisíveis para o sistema ao mesmo tempo.
//
// Esta tela junta só o que precisa de uma decisão, marca vários de uma vez e
// resolve em lote. Quando não há nada pendente ela diz isso e sai da frente.

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ListChecks, UserPlus, CalendarClock, Check, AlertTriangle } from "lucide-react";
import type { DashboardState } from "@/lib/dashboardTypes";
import type { FlatCard } from "@/lib/flattenItems";
import { aplicarEmLote } from "@/lib/edicaoEmLote";
import { pendencias, cargaPorPessoa } from "@/lib/triagem";
import { useProfiles, initials, colorFor, type Profile } from "@/lib/profiles";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { contaDoEscritorio } from "@/lib/importTrello";
import { areaById, MODULO_COLOR, moduloOf } from "@/lib/areas";
import { corDoEstado } from "@/lib/etapas";

type Props = {
  data: DashboardState;
  setData: (updater: (d: DashboardState) => DashboardState) => void;
  abrirCard: (card: FlatCard) => void;
};

type Aba = "semDono" | "noEscritorio" | "semPrazo";

export default function Triagem({ data, setData, abrirCard }: Props) {
  const profiles = useProfiles();
  const currentUser = useCurrentUser();
  const [aba, setAba] = useState<Aba>("semDono");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [prazo, setPrazo] = useState("");
  const [feito, setFeito] = useState("");

  const escritorio = useMemo(() => contaDoEscritorio(profiles) || "", [profiles]);
  const p = useMemo(() => pendencias(data, escritorio), [data, escritorio]);
  const carga = useMemo(() => cargaPorPessoa(data), [data]);

  const listas: Record<Aba, FlatCard[]> = {
    semDono: p.semDono,
    noEscritorio: p.noEscritorio,
    semPrazo: p.semPrazo,
  };
  const lista = listas[aba];
  const selecionados = lista.filter((c) => marcados.has(c.itemId));

  function trocarAba(nova: Aba) {
    setAba(nova);
    setMarcados(new Set());
    setFeito("");
  }

  function alternar(id: string) {
    const novo = new Set(marcados);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    setMarcados(novo);
  }

  function aplicar(acao: Parameters<typeof aplicarEmLote>[2], resumo: string) {
    if (!selecionados.length) return;
    const quantos = selecionados.length;
    setData((d) => aplicarEmLote(d, selecionados, acao).data);
    setMarcados(new Set());
    setFeito(`${quantos} ${quantos === 1 ? "card" : "cards"} ${resumo}`);
  }

  const nada = !p.semDono.length && !p.noEscritorio.length && !p.semPrazo.length;

  return (
    <div style={{ fontFamily: "Outfit, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ background: "#F59E0B18", borderRadius: 10, padding: 10 }}>
          <ListChecks size={20} color="#F59E0B" />
        </div>
        <div>
          <h2 style={{ color: "#0F172A", fontSize: 20, fontWeight: 900 }}>Triagem</h2>
          <p style={{ color: "#64748B", fontSize: 12 }}>
            O que está no sistema mas ainda não é trabalho de ninguém.
          </p>
        </div>
      </div>

      {nada ? (
        <div style={{ ...aviso, background: "#F0FDF4", borderColor: "#BBF7D0", color: "#166534" }}>
          <strong>Nada pendente.</strong> Todo card ativo tem responsável e prazo. Os{" "}
          {p.suspensos.length} suspensos ficam de fora de propósito: estão parados por decisão, não
          por esquecimento.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0 6px" }}>
            <Guia
              ligada={aba === "semDono"}
              onClick={() => trocarAba("semDono")}
              n={p.semDono.length}
              rotulo="Sem responsável"
              ajuda="Não aparecem no Eu de ninguém"
            />
            {p.noEscritorio.length > 0 && (
              <Guia
                ligada={aba === "noEscritorio"}
                onClick={() => trocarAba("noEscritorio")}
                n={p.noEscritorio.length}
                rotulo="Na conta do escritório"
                ajuda="Ficaram com quem saiu; precisam de dono de verdade"
              />
            )}
            <Guia
              ligada={aba === "semPrazo"}
              onClick={() => trocarAba("semPrazo")}
              n={p.semPrazo.length}
              rotulo="Sem prazo"
              ajuda="Não entram em alerta nem em relatório de atraso"
            />
          </div>

          <p style={{ fontSize: 11, color: "#64748B", marginBottom: 12 }}>
            De {p.ativos.length} cards ativos. Os {p.suspensos.length} suspensos não entram aqui:
            estão parados por decisão.
          </p>

          {feito && (
            <div
              style={{ ...aviso, background: "#F0FDF4", borderColor: "#BBF7D0", color: "#166534" }}
            >
              <Check size={13} style={{ verticalAlign: -2 }} /> {feito}
            </div>
          )}

          <CargaDoTime carga={carga} profiles={profiles} />

          {/* Ações em lote */}
          <div style={barra}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#0F172A", whiteSpace: "nowrap" }}>
              {selecionados.length
                ? `${selecionados.length} marcado${selecionados.length > 1 ? "s" : ""}`
                : "Marque os cards abaixo"}
            </span>
            <button
              onClick={() => setMarcados(new Set(lista.map((c) => c.itemId)))}
              style={botaoMini}
            >
              Marcar todos ({lista.length})
            </button>
            {selecionados.length > 0 && (
              <button onClick={() => setMarcados(new Set())} style={botaoMini}>
                Limpar
              </button>
            )}

            <div style={{ flex: 1 }} />

            {aba === "semPrazo" ? (
              <>
                <CalendarClock size={14} color="#64748B" />
                <input
                  value={prazo}
                  onChange={(e) => setPrazo(e.target.value)}
                  placeholder="DD/MM/AAAA"
                  style={{ ...campo, width: 120 }}
                />
                <button
                  disabled={!selecionados.length || !/^\d{2}\/\d{2}\/\d{4}$/.test(prazo)}
                  onClick={() => aplicar({ tipo: "prazo", prazo }, `com prazo para ${prazo}`)}
                  style={
                    selecionados.length && /^\d{2}\/\d{2}\/\d{4}$/.test(prazo)
                      ? botaoPrincipal
                      : { ...botaoPrincipal, ...desligado }
                  }
                >
                  Definir prazo
                </button>
              </>
            ) : (
              <>
                <UserPlus size={14} color="#64748B" />
                <select
                  disabled={!selecionados.length}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    const nome = profiles.find((x) => x.id === id)?.display_name || "";
                    aplicar(
                      { tipo: "responsaveis", ids: [id], modo: "substituir" },
                      `com ${nome} como responsável`,
                    );
                    e.target.value = "";
                  }}
                  style={{ ...campo, minWidth: 190 }}
                  defaultValue=""
                >
                  <option value="">Atribuir a...</option>
                  {profiles
                    .filter((x) => x.id !== escritorio)
                    .map((x) => {
                      const c = carga.find((y) => y.id === x.id);
                      return (
                        <option key={x.id} value={x.id}>
                          {x.display_name}
                          {c ? ` — já tem ${c.ativos}` : " — sem nenhum"}
                        </option>
                      );
                    })}
                </select>
                {currentUser && (
                  <button
                    disabled={!selecionados.length}
                    onClick={() =>
                      aplicar(
                        { tipo: "responsaveis", ids: [currentUser.id], modo: "substituir" },
                        "para você",
                      )
                    }
                    style={
                      selecionados.length ? botaoPrincipal : { ...botaoPrincipal, ...desligado }
                    }
                  >
                    Assumir
                  </button>
                )}
              </>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10 }}>
            {lista.length === 0 && (
              <div
                style={{
                  ...aviso,
                  background: "#F0FDF4",
                  borderColor: "#BBF7D0",
                  color: "#166534",
                }}
              >
                Nada aqui. Esta lista está resolvida.
              </div>
            )}
            {lista.map((c) => (
              <Linha
                key={c.itemId}
                card={c}
                marcado={marcados.has(c.itemId)}
                onMarcar={() => alternar(c.itemId)}
                onAbrir={() => abrirCard(c)}
                profiles={profiles}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CargaDoTime({
  carga,
  profiles,
}: {
  carga: { id: string; ativos: number }[];
  profiles: Profile[];
}) {
  if (!carga.length) return null;
  const maior = carga[0].ativos || 1;
  return (
    <div
      style={{
        background: "#F8FAFC",
        border: "1px solid #E2E8F0",
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <p style={{ fontSize: 11, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>
        Quem já está com o quê{" "}
        <span style={{ fontWeight: 400, color: "#64748B" }}>
          — para distribuir sabendo, não no escuro
        </span>
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {carga.map((c) => {
          const perfil = profiles.find((x) => x.id === c.id);
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#475569", minWidth: 150 }}>
                {perfil?.display_name || "(quem saiu)"}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 8,
                  background: "#E2E8F0",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.round((c.ativos / maior) * 100)}%`,
                    height: "100%",
                    background: colorFor(c.id),
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#0F172A",
                  minWidth: 24,
                  textAlign: "right",
                }}
              >
                {c.ativos}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Linha({
  card,
  marcado,
  onMarcar,
  onAbrir,
  profiles,
}: {
  card: FlatCard;
  marcado: boolean;
  onMarcar: () => void;
  onAbrir: () => void;
  profiles: Profile[];
}) {
  const area = areaById(card.areaId);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: marcado ? "#F0FDFA" : "#fff",
        border: `1px solid ${marcado ? "#99F6E4" : "#E2E8F0"}`,
        borderLeft: `3px solid ${MODULO_COLOR[moduloOf(card.areaId)] || "#CBD5E1"}`,
        borderRadius: 10,
        padding: "8px 11px",
      }}
    >
      <input type="checkbox" checked={marcado} onChange={onMarcar} />
      <button
        onClick={onAbrir}
        style={{
          flex: 1,
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          padding: 0,
          minWidth: 0,
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
          {card.itemNome}
        </div>
        <div style={{ fontSize: 10.5, color: "#64748B" }}>
          {card.clienteNome} · {area?.name || card.modulo}
        </div>
      </button>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: corDoEstado(card.etapa || card.kanbanStatus),
          whiteSpace: "nowrap",
        }}
      >
        {card.etapa || card.kanbanStatus}
      </span>
      <div style={{ display: "flex", gap: 3 }}>
        {(card.responsaveis || []).map((id) => {
          const perfil = profiles.find((x) => x.id === id);
          return (
            <span
              key={id}
              title={perfil?.display_name || id}
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: colorFor(id),
                color: "#fff",
                fontSize: 8.5,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {initials(perfil?.display_name || "?")}
            </span>
          );
        })}
      </div>
      {!card.prazo && (
        <AlertTriangle size={12} color="#F59E0B" style={{ flexShrink: 0 }} aria-label="sem prazo" />
      )}
      {card.prazo && (
        <span style={{ fontSize: 10, color: "#64748B", whiteSpace: "nowrap" }}>{card.prazo}</span>
      )}
    </div>
  );
}

function Guia({
  ligada,
  onClick,
  n,
  rotulo,
  ajuda,
}: {
  ligada: boolean;
  onClick: () => void;
  n: number;
  rotulo: string;
  ajuda: string;
}) {
  return (
    <button
      onClick={onClick}
      title={ajuda}
      style={{
        background: ligada ? "#0F172A" : "#fff",
        color: ligada ? "#fff" : "#475569",
        border: `1px solid ${ligada ? "#0F172A" : "#E2E8F0"}`,
        borderRadius: 10,
        padding: "8px 13px",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
      }}
    >
      {rotulo}
      <span
        style={{
          background: ligada ? "#1E293B" : "#F1F5F9",
          borderRadius: 20,
          padding: "1px 7px",
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        {n}
      </span>
    </button>
  );
}

const barra: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 12,
  padding: "10px 12px",
  position: "sticky",
  top: 0,
  zIndex: 20,
};
const aviso: CSSProperties = {
  background: "#FFFBEB",
  border: "1px solid #FDE68A",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 12,
  color: "#78350F",
  lineHeight: 1.6,
  marginBottom: 12,
};
const campo: CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: "6px 9px",
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
  padding: "7px 13px",
  color: "#fff",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};
const desligado: CSSProperties = { background: "#CBD5E1", cursor: "not-allowed" };
const botaoMini: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
  cursor: "pointer",
  fontFamily: "inherit",
};
