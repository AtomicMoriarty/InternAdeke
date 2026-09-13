// @ts-nocheck
import { useMemo, useState } from "react";
import { CalendarRange, AlertTriangle, Inbox } from "lucide-react";
import { useDashboardState } from "@/lib/useDashboardState";
import { useProfiles, initials, colorFor } from "@/lib/profiles";
import { COLUMN_COLORS } from "@/lib/flattenItems";
import { MODULOS } from "@/lib/areas";
import { montarGantt, posicaoDaBarra, marcasDeMes, diasEntre } from "@/lib/gantt";

const LARGURA_ROTULO = 240;

function hojeBR() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function Gantt() {
  const { data, loaded, update } = useDashboardState("gantt");
  const profiles = useProfiles();
  const [modulo, setModulo] = useState("todos");
  const [ocultarFinalizados, setOcultarFinalizados] = useState(true);

  // Uma referência de 'agora' estável por render, para os cálculos não
  // divergirem entre si dentro da mesma passada.
  const hoje = useMemo(() => new Date(), []);
  const g = useMemo(() => (data ? montarGantt(data, hoje) : null), [data, hoje]);

  const barras = useMemo(() => {
    if (!g) return [];
    return g.barras.filter(
      (b) =>
        (modulo === "todos" || b.item.modulo === modulo) &&
        (!ocultarFinalizados || b.item.status !== "Finalizado"),
    );
  }, [g, modulo, ocultarFinalizados]);

  const semDatas = useMemo(() => {
    if (!g) return [];
    return g.semDatas.filter(
      (i) =>
        (modulo === "todos" || i.modulo === modulo) &&
        (!ocultarFinalizados || i.status !== "Finalizado"),
    );
  }, [g, modulo, ocultarFinalizados]);

  /** Grava uma data direto na lista de pendências, sem abrir o card. */
  function definirData(item, campo, valor) {
    update((prev) => {
      const mapear = (it) => (it.id === item.itemId ? { ...it, [campo]: valor } : it);
      return {
        ...prev,
        areas: (prev.areas || []).map((a) => ({
          ...a,
          clientes: (a.clientes || []).map((c) => ({
            ...c,
            planos: (c.planos || []).map((p) => ({ ...p, items: (p.items || []).map(mapear) })),
          })),
        })),
        produtos: (prev.produtos || []).map((p) => ({ ...p, items: (p.items || []).map(mapear) })),
      };
    });
  }

  if (!loaded || !g) {
    return (
      <div style={{ padding: 40, color: "#64748B", fontFamily: "Outfit, sans-serif" }}>
        Carregando…
      </div>
    );
  }

  const meses = marcasDeMes(g.de, g.ate, g.totalDias);
  const posHoje = (diasEntre(g.de, hoje) / g.totalDias) * 100;

  return (
    <div
      style={{
        padding: "24px 28px",
        fontFamily: "Outfit, sans-serif",
        background: "#F0F5FF",
        minHeight: "100vh",
      }}
    >
      {/* Cabeçalho */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#0F172A", letterSpacing: -0.4 }}>
            Linha do tempo
          </h1>
          <p style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
            {barras.length} na linha · {semDatas.length} sem data
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div
            style={{
              display: "inline-flex",
              background: "#fff",
              borderRadius: 8,
              padding: 2,
              border: "1px solid #E2E8F0",
            }}
          >
            {["todos", ...MODULOS].map((m) => (
              <button
                key={m}
                onClick={() => setModulo(m)}
                style={{
                  background: modulo === m ? "#0DD3C5" : "transparent",
                  color: modulo === m ? "#fff" : "#64748B",
                  border: "none",
                  padding: "6px 11px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {m === "todos" ? "Todos" : m}
              </button>
            ))}
          </div>
          <button
            onClick={() => setOcultarFinalizados((v) => !v)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 11px",
              borderRadius: 8,
              border: `1px solid ${ocultarFinalizados ? "#0DD3C5" : "#E2E8F0"}`,
              background: ocultarFinalizados ? "#F0FDFA" : "#fff",
              color: ocultarFinalizados ? "#0F766E" : "#64748B",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Ocultar finalizados
          </button>
        </div>
      </div>

      {/* Linha do tempo */}
      {barras.length === 0 ? (
        <Vazio
          titulo="Nenhuma demanda na linha do tempo"
          texto={
            semDatas.length
              ? "Os itens abaixo ainda não têm data. Preencha início ou prazo e eles aparecem aqui."
              : "Assim que houver demandas com data de início ou prazo, elas aparecem aqui."
          }
        />
      ) : (
        <div
          style={{
            background: "#fff",
            border: "1px solid #E2E8F0",
            borderRadius: 14,
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          {/* Régua */}
          <div
            style={{ display: "flex", borderBottom: "1px solid #E2E8F0", background: "#F8FAFC" }}
          >
            <div
              style={{
                width: LARGURA_ROTULO,
                flexShrink: 0,
                padding: "8px 12px",
                fontSize: 10,
                fontWeight: 700,
                color: "#94A3B8",
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              Demanda
            </div>
            <div style={{ flex: 1, position: "relative", height: 32 }}>
              {meses.map((m) => (
                <span
                  key={m.rotulo}
                  style={{
                    position: "absolute",
                    left: `${m.esquerda}%`,
                    top: 8,
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#64748B",
                    borderLeft: "1px solid #E2E8F0",
                    paddingLeft: 5,
                    height: 20,
                  }}
                >
                  {m.rotulo}
                </span>
              ))}
            </div>
          </div>

          {/* Barras */}
          <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
            {barras.map((b, idx) => {
              const pos = posicaoDaBarra(b, g.de, g.totalDias);
              const cor = b.atrasado ? "#DC2626" : COLUMN_COLORS[b.item.status] || "#64748B";
              const resps = (b.item.responsaveis || [])
                .map((id) => profiles.find((p) => p.id === id))
                .filter(Boolean);
              return (
                <div
                  key={b.item.itemId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    borderBottom: idx < barras.length - 1 ? "1px solid #F1F5F9" : "none",
                    background: b.atrasado ? "#FEF2F2" : "transparent",
                  }}
                >
                  <div
                    style={{
                      width: LARGURA_ROTULO,
                      flexShrink: 0,
                      padding: "8px 12px",
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
                      {b.atrasado && (
                        <AlertTriangle
                          size={11}
                          color="#DC2626"
                          style={{ display: "inline", marginRight: 4, verticalAlign: -1 }}
                        />
                      )}
                      {b.item.itemNome}
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
                      {b.item.clienteNome} · {b.item.modulo}
                    </div>
                  </div>
                  <div style={{ flex: 1, position: "relative", height: 42 }}>
                    {/* marca de hoje */}
                    {posHoje >= 0 && posHoje <= 100 && (
                      <span
                        style={{
                          position: "absolute",
                          left: `${posHoje}%`,
                          top: 0,
                          bottom: 0,
                          width: 1,
                          background: "#0DD3C5",
                          opacity: 0.45,
                        }}
                      />
                    )}
                    <div
                      title={`${b.item.dataInicio || "sem início"} → ${b.item.prazo || "sem prazo"}${b.fimEstimado ? " (estimado)" : ""}`}
                      style={{
                        position: "absolute",
                        left: `${pos.esquerda}%`,
                        width: `${pos.largura}%`,
                        top: 11,
                        height: 20,
                        borderRadius: 6,
                        background: b.fimEstimado
                          ? `repeating-linear-gradient(45deg, ${cor}, ${cor} 5px, ${cor}bb 5px, ${cor}bb 10px)`
                          : cor,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        paddingRight: 5,
                        gap: 2,
                        minWidth: 8,
                      }}
                    >
                      {resps.slice(0, 3).map((p, i) => (
                        <span
                          key={p.id}
                          title={p.display_name}
                          style={{
                            width: 15,
                            height: 15,
                            borderRadius: "50%",
                            flexShrink: 0,
                            background: p.avatar_color || colorFor(p.id),
                            color: "#fff",
                            fontSize: 7,
                            fontWeight: 800,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "1px solid rgba(255,255,255,.7)",
                            marginLeft: i ? -4 : 0,
                          }}
                        >
                          {initials(p.display_name)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pendentes de data — preenchimento no lugar */}
      {semDatas.length > 0 && (
        <div
          style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 18 }}
        >
          <div style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 7 }}>
            <CalendarRange size={15} color="#F59E0B" />
            <span style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>
              Sem data ({semDatas.length})
            </span>
          </div>
          <p style={{ fontSize: 11, color: "#94A3B8", marginBottom: 12 }}>
            Preencha início ou prazo e a demanda entra na linha do tempo. Basta uma das duas.
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: 380,
              overflowY: "auto",
            }}
          >
            {semDatas.map((item) => (
              <div
                key={item.itemId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 9px",
                  background: "#F8FAFC",
                  borderRadius: 8,
                  border: "1px solid #F1F5F9",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>
                    {item.itemNome}
                  </div>
                  <div style={{ fontSize: 10, color: "#94A3B8" }}>
                    {item.clienteNome} · {item.modulo}
                  </div>
                </div>
                <CampoData
                  rotulo="Início"
                  valor={item.dataInicio}
                  onSalvar={(v) => definirData(item, "dataInicio", v)}
                  atalho={hojeBR()}
                />
                <CampoData
                  rotulo="Prazo"
                  valor={item.prazo}
                  onSalvar={(v) => definirData(item, "prazo", v)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Campo de data que só grava ao sair, para não salvar a cada tecla. */
function CampoData({
  rotulo,
  valor,
  onSalvar,
  atalho,
}: {
  rotulo: string;
  valor: string;
  onSalvar: (v: string) => void;
  /** Botão de preenchimento rápido. Ausente quando não faz sentido. */
  atalho?: string;
}) {
  const [rascunho, setRascunho] = useState(valor || "");
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700 }}>{rotulo}</span>
      <input
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={() => rascunho !== (valor || "") && onSalvar(rascunho)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder="DD/MM/AAAA"
        style={{
          width: 105,
          background: "#fff",
          border: "1px solid #E2E8F0",
          borderRadius: 6,
          padding: "5px 7px",
          fontSize: 11,
          fontFamily: "inherit",
          outline: "none",
          color: "#0F172A",
        }}
      />
      {atalho && !rascunho && (
        <button
          onClick={() => {
            setRascunho(atalho);
            onSalvar(atalho);
          }}
          title="Usar a data de hoje"
          style={{
            background: "#F1F5F9",
            border: "1px solid #E2E8F0",
            borderRadius: 6,
            padding: "5px 7px",
            fontSize: 10,
            fontWeight: 700,
            color: "#475569",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          hoje
        </button>
      )}
    </span>
  );
}

function Vazio({ titulo, texto }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px dashed #CBD5E1",
        borderRadius: 14,
        padding: 40,
        textAlign: "center",
        marginBottom: 16,
      }}
    >
      <Inbox size={24} color="#CBD5E1" style={{ marginBottom: 8 }} />
      <p style={{ fontSize: 14, fontWeight: 700, color: "#64748B" }}>{titulo}</p>
      <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{texto}</p>
    </div>
  );
}
