// @ts-nocheck
import { useMemo, useState } from "react";
import {
  Download, Clock, AlertTriangle, CheckCircle2, Users, Activity, Inbox,
} from "lucide-react";
import { useDashboardState } from "@/lib/useDashboardState";
import { useProfiles, initials, colorFor } from "@/lib/profiles";
import { COLUMN_COLORS } from "@/lib/flattenItems";
import {
  achatarItens, cargaPorPessoa, mediaTempoPorEtapa, itensParados,
  atividadeNoPeriodo, situacaoPrazo, diasEmAberto, diasParado,
  paraCSV, baixarCSV,
} from "@/lib/relatorios";

const PERIODOS = [
  { v: 7,   l: "7 dias" },
  { v: 30,  l: "30 dias" },
  { v: 90,  l: "90 dias" },
  { v: 0,   l: "Tudo" },
];

function hojeArquivo() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Relatorios() {
  const { data, loaded } = useDashboardState("relatorios");
  const profiles = useProfiles();
  const [periodoDias, setPeriodoDias] = useState(7);

  const agora = useMemo(() => new Date(), [data]);
  const itens = useMemo(() => (data ? achatarItens(data) : []), [data]);

  const desde = useMemo(() => {
    if (!periodoDias) return new Date(0);
    const d = new Date(agora);
    d.setDate(d.getDate() - periodoDias);
    return d;
  }, [periodoDias, agora]);

  const carga     = useMemo(() => cargaPorPessoa(itens, agora), [itens, agora]);
  const tempos    = useMemo(() => mediaTempoPorEtapa(itens, agora), [itens, agora]);
  const parados   = useMemo(() => itensParados(itens, 7, agora), [itens, agora]);
  const atividade = useMemo(() => atividadeNoPeriodo(itens, desde, agora), [itens, desde, agora]);

  const kpis = useMemo(() => {
    const abertos = itens.filter(i => i.status !== "Finalizado");
    const vencidos = abertos.filter(i => situacaoPrazo(i, agora).situacao === "vencido");
    const semResp = abertos.filter(i => i.responsaveis.length === 0);
    return {
      total: itens.length,
      abertos: abertos.length,
      finalizados: itens.length - abertos.length,
      vencidos: vencidos.length,
      semResp: semResp.length,
      parados: parados.length,
    };
  }, [itens, parados, agora]);

  const nome = (uid) => profiles.find(p => p.id === uid)?.display_name || "—";

  function exportarCarga() {
    baixarCSV(
      `carga-por-pessoa-${hojeArquivo()}.csv`,
      paraCSV(
        ["Pessoa", "Total", "Em aberto", "Finalizados", "Vencidos", "Parados 7d+", "Média dias em aberto"],
        carga.map(c => [
          nome(c.userId), c.total, c.total - c.concluidos, c.concluidos,
          c.vencidos, c.parados7, c.mediaDiasEmAberto ?? "",
        ])
      )
    );
  }

  function exportarItens() {
    baixarCSV(
      `itens-${hojeArquivo()}.csv`,
      paraCSV(
        ["Módulo", "Cliente", "Plano", "Item", "Status", "Responsáveis", "Início", "Prazo", "Situação do prazo", "Dias em aberto", "Dias parado", "Checklist"],
        itens.map(i => {
          const sp = situacaoPrazo(i, agora);
          return [
            i.modulo, i.clienteNome, i.planoNome, i.itemNome, i.status,
            i.responsaveis.map(nome).join(", "),
            i.dataInicio, i.prazo, sp.situacao,
            diasEmAberto(i, agora) ?? "", diasParado(i, agora) ?? "",
            i.checklistTotal ? `${i.checklistFeitos}/${i.checklistTotal}` : "",
          ];
        })
      )
    );
  }

  if (!loaded) {
    return <div style={{ padding: 40, color: "#64748B", fontFamily: "Outfit, sans-serif" }}>Carregando…</div>;
  }

  const semDados = itens.length === 0;

  return (
    <div style={{ padding: "28px 32px", fontFamily: "Outfit, sans-serif", background: "#F0F5FF", minHeight: "100vh" }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#0F172A", letterSpacing: -0.4 }}>Relatórios</h1>
          <p style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
            {itens.length} {itens.length === 1 ? "item" : "itens"} no sistema
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", background: "#fff", borderRadius: 8, padding: 2, border: "1px solid #E2E8F0" }}>
            {PERIODOS.map(p => (
              <button key={p.v} onClick={() => setPeriodoDias(p.v)} style={{
                background: periodoDias === p.v ? "#0DD3C5" : "transparent",
                color: periodoDias === p.v ? "#fff" : "#64748B",
                border: "none", padding: "6px 12px", borderRadius: 6,
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>{p.l}</button>
            ))}
          </div>
          <button onClick={exportarItens} style={btnExport} title="Baixar todos os itens em CSV">
            <Download size={13} /> Itens
          </button>
          <button onClick={exportarCarga} style={btnExport} title="Baixar carga por pessoa em CSV">
            <Download size={13} /> Carga
          </button>
        </div>
      </div>

      {semDados ? (
        <Vazio
          icone={<Inbox size={26} color="#CBD5E1" />}
          titulo="Nenhum item cadastrado ainda"
          texto="Os relatórios aparecem conforme vocês forem criando demandas nos quadros."
        />
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
            <Kpi label="Em aberto"      valor={kpis.abertos}     cor="#3B82F6" Icone={Activity} />
            <Kpi label="Finalizados"    valor={kpis.finalizados} cor="#10B981" Icone={CheckCircle2} />
            <Kpi label="Prazo vencido"  valor={kpis.vencidos}    cor="#DC2626" Icone={AlertTriangle} />
            <Kpi label="Parados 7d+"    valor={kpis.parados}     cor="#F59E0B" Icone={Clock} />
            <Kpi label="Sem responsável" valor={kpis.semResp}    cor="#94A3B8" Icone={Users} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14, marginBottom: 14 }}>
            {/* Carga por pessoa */}
            <Cartao titulo="Carga por pessoa" sub="Quantas demandas cada um tem">
              {carga.length === 0 ? (
                <Nota>Nenhum item tem responsável atribuído. Abra um card e use <strong>Membros</strong> para atribuir.</Nota>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "#94A3B8", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      <th style={thLeft}>Pessoa</th>
                      <th style={th}>Aberto</th>
                      <th style={th}>Feito</th>
                      <th style={th} title="Prazo vencido">Atraso</th>
                      <th style={th} title="Sem movimento há 7 dias ou mais">Parado</th>
                      <th style={th} title="Média de dias desde a data de início">Média</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carga.map(c => {
                      const p = profiles.find(x => x.id === c.userId);
                      const cor = p ? (p.avatar_color || colorFor(p.id)) : "#64748B";
                      return (
                        <tr key={c.userId} style={{ borderTop: "1px solid #F1F5F9" }}>
                          <td style={{ padding: "8px 4px" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                              <span style={{
                                width: 22, height: 22, borderRadius: "50%", background: cor, color: "#fff",
                                fontSize: 9, fontWeight: 800, display: "inline-flex",
                                alignItems: "center", justifyContent: "center", flexShrink: 0,
                              }}>{p ? initials(p.display_name) : "?"}</span>
                              <span style={{ fontWeight: 600, color: "#0F172A" }}>{nome(c.userId)}</span>
                            </span>
                          </td>
                          <td style={td}>{c.total - c.concluidos}</td>
                          <td style={{ ...td, color: "#10B981" }}>{c.concluidos}</td>
                          <td style={{ ...td, color: c.vencidos ? "#DC2626" : "#CBD5E1", fontWeight: c.vencidos ? 800 : 500 }}>{c.vencidos}</td>
                          <td style={{ ...td, color: c.parados7 ? "#B45309" : "#CBD5E1", fontWeight: c.parados7 ? 800 : 500 }}>{c.parados7}</td>
                          <td style={{ ...td, color: "#64748B" }}>{c.mediaDiasEmAberto ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Cartao>

            {/* Tempo por etapa */}
            <Cartao titulo="Tempo médio por etapa" sub="Onde as demandas ficam mais tempo">
              {tempos.length === 0 ? (
                <Nota>
                  Ainda não há histórico suficiente. A contagem começa na primeira vez
                  que um card muda de coluna — dados anteriores não existem.
                </Nota>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {tempos.map(t => {
                    const max = Math.max(...tempos.map(x => x.mediaDias), 1);
                    const cor = COLUMN_COLORS[t.status] || "#64748B";
                    return (
                      <div key={t.status}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#0F172A" }}>{t.status}</span>
                          <span style={{ fontSize: 11, color: "#64748B" }}>
                            {t.mediaDias}d <span style={{ color: "#CBD5E1" }}>· {t.amostras} {t.amostras === 1 ? "item" : "itens"}</span>
                          </span>
                        </div>
                        <div style={{ height: 7, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ width: `${(t.mediaDias / max) * 100}%`, height: "100%", background: cor, borderRadius: 4 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Cartao>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>
            {/* Parados */}
            <Cartao titulo="Sem movimento" sub="Há 7 dias ou mais na mesma etapa">
              {parados.length === 0 ? (
                <Nota>Nada parado há mais de 7 dias.</Nota>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 320, overflowY: "auto" }}>
                  {parados.slice(0, 30).map(({ item, dias }) => (
                    <div key={item.itemId} style={{
                      display: "flex", alignItems: "center", gap: 9, padding: "7px 9px",
                      background: dias >= 14 ? "#FEF2F2" : "#FFFBEB", borderRadius: 8,
                      border: `1px solid ${dias >= 14 ? "#FECACA" : "#FDE68A"}`,
                    }}>
                      <span style={{
                        fontSize: 12, fontWeight: 900, color: dias >= 14 ? "#DC2626" : "#B45309",
                        minWidth: 34, textAlign: "right",
                      }}>{dias}d</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.itemNome}
                        </div>
                        <div style={{ fontSize: 10, color: "#94A3B8" }}>
                          {item.clienteNome} · {item.modulo} · {item.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Cartao>

            {/* Atividade */}
            <Cartao
              titulo="Atividade"
              sub={periodoDias ? `Últimos ${periodoDias} dias` : "Todo o período"}
            >
              {atividade.length === 0 ? (
                <Nota>
                  Nenhuma movimentação {periodoDias ? `nos últimos ${periodoDias} dias` : "registrada"}.
                  Mudanças de status e comentários aparecem aqui.
                </Nota>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 320, overflowY: "auto" }}>
                  {atividade.slice(0, 50).map((e, idx) => (
                    <div key={`${e.item.itemId}-${e.em}-${idx}`} style={{ display: "flex", gap: 8 }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%", marginTop: 5, flexShrink: 0,
                        background: e.tipo === "status" ? "#3B82F6" : "#8B5CF6",
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, color: "#0F172A" }}>
                          <strong>{e.item.itemNome}</strong>
                          <span style={{ color: "#64748B" }}> — {e.descricao.length > 90 ? e.descricao.slice(0, 90) + "…" : e.descricao}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>
                          {new Date(e.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          {e.autorNome ? ` · ${e.autorNome}` : ""}
                          {` · ${e.item.clienteNome}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Cartao>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, valor, cor, Icone }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12,
      padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9, background: `${cor}18`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icone size={16} color={cor} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#0F172A", lineHeight: 1.1 }}>{valor}</div>
        <div style={{ fontSize: 10.5, color: "#64748B" }}>{label}</div>
      </div>
    </div>
  );
}

function Cartao({ titulo, sub, children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 18 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>{titulo}</div>
        {sub && <div style={{ fontSize: 10.5, color: "#94A3B8", marginTop: 1 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Nota({ children }) {
  return (
    <p style={{ fontSize: 11.5, color: "#94A3B8", lineHeight: 1.6, padding: "6px 0" }}>{children}</p>
  );
}

function Vazio({ icone, titulo, texto }) {
  return (
    <div style={{
      background: "#fff", border: "1px dashed #CBD5E1", borderRadius: 16,
      padding: 48, textAlign: "center",
    }}>
      <div style={{ marginBottom: 10 }}>{icone}</div>
      <p style={{ fontSize: 14, fontWeight: 700, color: "#64748B" }}>{titulo}</p>
      <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{texto}</p>
    </div>
  );
}

const th     = { padding: "6px 4px", textAlign: "center", fontWeight: 700 };
const thLeft = { padding: "6px 4px", textAlign: "left",   fontWeight: 700 };
const td     = { padding: "8px 4px", textAlign: "center", fontWeight: 700, color: "#0F172A" };
const btnExport = {
  display: "inline-flex", alignItems: "center", gap: 5,
  background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8,
  padding: "7px 12px", fontSize: 11, fontWeight: 700, color: "#475569",
  cursor: "pointer", fontFamily: "inherit",
};
