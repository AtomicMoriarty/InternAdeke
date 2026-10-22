// O calendário de prazos: o mês inteiro numa tela, e a agenda de cada um.
//
// A linha do tempo mostra quanto tempo cada coisa leva; aqui a pergunta é "o
// que vence quando". Os vencidos ficam numa coluna à parte, porque são eles que
// pedem ação hoje, e o botão de agenda leva os prazos para o Google, Outlook
// ou Apple — o equivalente ao Planner do Trello, sem depender de integração.

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Download, AlertTriangle } from "lucide-react";
import { useDashboardState } from "@/lib/useDashboardState";
import { flattenDashboard, MODULO_COLOR, type FlatCard } from "@/lib/flattenItems";
import { areaById, MODULOS } from "@/lib/areas";
import { globalDeQualquerArea } from "@/lib/etapas";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { diaNoEscritorio, lerPrazo } from "@/lib/prazos";
import { gerarIcs, gradeDoMes, porDia, somarMes } from "@/lib/calendario";
import ItemModal from "@/components/ItemModal";

const NOMES_MES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
/** Quantos cards cabem num dia antes do "+N". */
const POR_DIA = 3;

function encerrado(c: FlatCard) {
  const g = globalDeQualquerArea(c.etapa || c.kanbanStatus);
  return g === "Finalizado" || g === "Suspenso";
}

function corDoCard(c: FlatCard) {
  return areaById(c.areaId)?.cardColor || MODULO_COLOR[c.modulo] || "#64748B";
}

type Aberto = { areaId: string; clienteId: string; planoId: string; itemId: string };

export default function Calendario({ allowedModules }: { allowedModules: string[] }) {
  const { data, loaded } = useDashboardState("calendario");
  const eu = useCurrentUser();
  const hoje = diaNoEscritorio(new Date());
  const [mes, setMes] = useState(() => ({
    ano: Number(hoje.slice(0, 4)),
    mes: Number(hoje.slice(5, 7)),
  }));
  const [soMeus, setSoMeus] = useState(false);
  const [modulo, setModulo] = useState("todos");
  const [verEncerrados, setVerEncerrados] = useState(false);
  const [aberto, setAberto] = useState<Aberto | null>(null);

  const cards = useMemo(() => {
    if (!data) return [];
    return flattenDashboard(data).filter(
      (c) =>
        c.prazo &&
        allowedModules.includes(c.areaId) &&
        (modulo === "todos" || c.modulo === modulo) &&
        (!soMeus || (eu && c.responsaveis.includes(eu.id))) &&
        (verEncerrados || !encerrado(c)),
    );
  }, [data, allowedModules, modulo, soMeus, eu, verEncerrados]);

  const mapa = useMemo(() => porDia(cards), [cards]);
  const grade = useMemo(() => gradeDoMes(mes.ano, mes.mes), [mes]);
  const vencidos = useMemo(
    () =>
      cards
        .filter((c) => !encerrado(c) && (lerPrazo(c.prazo)?.dia ?? hoje) < hoje)
        .sort((a, b) => (lerPrazo(a.prazo)?.dia ?? "").localeCompare(lerPrazo(b.prazo)?.dia ?? "")),
    [cards, hoje],
  );

  function abrir(c: FlatCard) {
    setAberto({ areaId: c.areaId, clienteId: c.clienteId, planoId: c.planoId, itemId: c.itemId });
  }

  function baixarAgenda() {
    const origem = typeof window !== "undefined" ? window.location.origin : "";
    const ics = gerarIcs(
      cards
        .filter((c) => !encerrado(c))
        .map((c) => ({
          uid: c.itemId,
          titulo: `${c.itemNome} — ${c.clienteNome}`,
          prazo: c.prazo,
          descricao: `${areaById(c.areaId)?.name || c.modulo} · ${c.planoNome} · ${c.etapa || c.kanbanStatus}`,
          url: origem ? `${origem}/quadro?card=${encodeURIComponent(c.itemId)}` : undefined,
        })),
    );
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = soMeus ? "meus-prazos-adeke.ics" : "prazos-adeke.ics";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  if (!loaded) return <p style={{ padding: 40, color: "#94A3B8" }}>Carregando...</p>;

  return (
    <div style={{ padding: "28px 44px", fontFamily: "Outfit, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <CalendarDays size={18} color="#0DD3C5" />
        <button
          onClick={() => setMes((m) => somarMes(m.ano, m.mes, -1))}
          style={botaoIcone}
          title="Mês anterior"
        >
          <ChevronLeft size={16} />
        </button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0F172A", minWidth: 170 }}>
          {NOMES_MES[mes.mes - 1]} {mes.ano}
        </h2>
        <button
          onClick={() => setMes((m) => somarMes(m.ano, m.mes, 1))}
          style={botaoIcone}
          title="Próximo mês"
        >
          <ChevronRight size={16} />
        </button>
        <button
          onClick={() => setMes({ ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) })}
          style={botao(false)}
        >
          Hoje
        </button>
        <span style={{ flex: 1 }} />
        <button onClick={() => setSoMeus((v) => !v)} style={botao(soMeus)}>
          Só os meus
        </button>
        <button onClick={() => setVerEncerrados((v) => !v)} style={botao(verEncerrados)}>
          Mostrar encerrados
        </button>
        <select
          value={modulo}
          onChange={(e) => setModulo(e.target.value)}
          style={{ ...botao(false), paddingRight: 8 }}
        >
          <option value="todos">Todas as áreas</option>
          {MODULOS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          onClick={baixarAgenda}
          style={{ ...botao(false), display: "flex", alignItems: "center", gap: 6 }}
          title="Baixa um arquivo .ics que o Google Agenda, o Outlook e o Apple Calendar importam"
        >
          <Download size={14} /> Levar para a agenda
        </button>
      </div>

      <div style={{ display: "flex", gap: 18, marginTop: 18, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
            {DIAS_SEMANA.map((d) => (
              <div
                key={d}
                style={{ fontSize: 11, fontWeight: 700, color: "#64748B", padding: "4px 6px" }}
              >
                {d}
              </div>
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 1,
              background: "#E2E8F0",
              border: "1px solid #E2E8F0",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {grade.map(({ dia, doMes }) => {
              const doDia = mapa.get(dia) || [];
              const ehHoje = dia === hoje;
              return (
                <div
                  key={dia}
                  style={{
                    background: doMes ? "#fff" : "#F8FAFC",
                    minHeight: 96,
                    padding: 6,
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: ehHoje ? 800 : 600,
                      color: ehHoje ? "#fff" : doMes ? "#334155" : "#CBD5E1",
                      background: ehHoje ? "#0DD3C5" : "transparent",
                      borderRadius: 999,
                      alignSelf: "flex-start",
                      padding: ehHoje ? "1px 7px" : "1px 2px",
                    }}
                  >
                    {Number(dia.slice(8, 10))}
                  </span>
                  {doDia.slice(0, POR_DIA).map((c) => (
                    <Chip key={c.itemId} card={c} hoje={hoje} onClick={() => abrir(c)} />
                  ))}
                  {doDia.length > POR_DIA && (
                    <span style={{ fontSize: 10, color: "#64748B", fontWeight: 600 }}>
                      +{doDia.length - POR_DIA} neste dia
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <aside
          style={{
            width: 260,
            flexShrink: 0,
            background: "#FFF7ED",
            border: "1px solid #FED7AA",
            borderRadius: 10,
            padding: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 700,
              color: "#9A3412",
            }}
          >
            <AlertTriangle size={14} /> Vencidos ({vencidos.length})
          </div>
          {!vencidos.length && (
            <p style={{ fontSize: 12, color: "#9A3412", opacity: 0.8 }}>Nada vencido. 🎉</p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {vencidos.slice(0, 40).map((c) => (
              <Chip key={c.itemId} card={c} hoje={hoje} onClick={() => abrir(c)} mostrarData />
            ))}
          </div>
        </aside>
      </div>

      {aberto && (
        <ItemModal
          areaId={aberto.areaId}
          clienteId={aberto.clienteId}
          planoId={aberto.planoId}
          itemId={aberto.itemId}
          onClose={() => setAberto(null)}
        />
      )}
    </div>
  );
}

function Chip({
  card,
  hoje,
  onClick,
  mostrarData,
}: {
  card: FlatCard;
  hoje: string;
  onClick: () => void;
  mostrarData?: boolean;
}) {
  const p = lerPrazo(card.prazo);
  const fechado = encerrado(card);
  const vencido = !fechado && !!p && p.dia < hoje;
  return (
    <button
      onClick={onClick}
      title={`${card.itemNome} — ${card.clienteNome}${p?.hora ? ` · ${p.hora}` : ""}`}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        border: "none",
        borderLeft: `3px solid ${corDoCard(card)}`,
        background: vencido ? "#FEE2E2" : "#F1F5F9",
        borderRadius: 5,
        padding: "3px 6px",
        fontSize: 11,
        color: fechado ? "#94A3B8" : "#0F172A",
        textDecoration: fechado ? "line-through" : "none",
        cursor: "pointer",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {mostrarData && p ? `${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)} · ` : ""}
      {p?.hora && !mostrarData ? `${p.hora} ` : ""}
      {card.itemNome}
      <span style={{ color: "#64748B" }}> · {card.clienteNome}</span>
    </button>
  );
}

const botaoIcone: CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: 5,
  cursor: "pointer",
  lineHeight: 0,
  color: "#334155",
};

function botao(ativo: boolean): CSSProperties {
  return {
    background: ativo ? "#0DD3C5" : "#fff",
    color: ativo ? "#fff" : "#334155",
    border: `1px solid ${ativo ? "#0DD3C5" : "#E2E8F0"}`,
    borderRadius: 8,
    padding: "6px 11px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
