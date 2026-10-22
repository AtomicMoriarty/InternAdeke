// O relatório de horas: quanto tempo foi para cada cliente, demanda e
// subdemanda num período, e a planilha para conferir ou faturar.
//
// A tela responde a pergunta do fechamento do mês ("quanto a Acme consumiu?")
// em um clique, e desce até o detalhe sem trocar de tela: cliente → demanda →
// subdemanda. A planilha leva tudo — cada lançamento com dia, início, fim,
// duração e o que foi feito, mais os totais —, com horas que somam no Excel.

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ChevronDown, ChevronRight, Download, Timer } from "lucide-react";
import { buscarApontamentos } from "@/lib/apontamentos";
import {
  abasDaFolha,
  formatarDuracao,
  horasDecimais,
  somaSeg,
  totalizar,
  type Apontamento,
} from "@/lib/tempo";
import { gerarXlsx } from "@/lib/planilha";
import { useProfiles } from "@/lib/profiles";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { areaById, MODULO_PRODUTOS } from "@/lib/areas";

type Periodo = "semana" | "mes" | "mesPassado" | "personalizado";

function inicioDoDia(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function diaInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function deInput(s: string) {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** [de, até): até é exclusivo, meia-noite do dia seguinte ao último. */
function intervalo(p: Periodo, de: string, ate: string, hoje = new Date()): [Date, Date] {
  const h = inicioDoDia(hoje);
  if (p === "semana") {
    const seg = new Date(h);
    seg.setDate(h.getDate() - ((h.getDay() + 6) % 7));
    const fim = new Date(seg);
    fim.setDate(seg.getDate() + 7);
    return [seg, fim];
  }
  if (p === "mes")
    return [
      new Date(h.getFullYear(), h.getMonth(), 1),
      new Date(h.getFullYear(), h.getMonth() + 1, 1),
    ];
  if (p === "mesPassado") {
    return [
      new Date(h.getFullYear(), h.getMonth() - 1, 1),
      new Date(h.getFullYear(), h.getMonth(), 1),
    ];
  }
  const d1 = deInput(de) || h;
  const d2 = deInput(ate) || h;
  const fim = new Date(d2);
  fim.setDate(d2.getDate() + 1);
  return [d1, fim];
}

function nomeArea(areaId: string) {
  if (areaId === "produtos") return MODULO_PRODUTOS;
  return areaById(areaId)?.name || areaId;
}

export default function Horas({ allowedModules }: { allowedModules: string[] }) {
  const perfis = useProfiles();
  const eu = useCurrentUser();
  const hoje = new Date();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [de, setDe] = useState(diaInput(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
  const [ate, setAte] = useState(diaInput(hoje));
  const [pessoa, setPessoa] = useState("todos");
  const [area, setArea] = useState("todas");
  const [busca, setBusca] = useState("");
  const [aps, setAps] = useState<Apontamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const [ini, fim] = useMemo(() => intervalo(periodo, de, ate), [periodo, de, ate]);

  useEffect(() => {
    let vivo = true;
    const carregar = async () => {
      setCarregando(true);
      const r = await buscarApontamentos(ini, fim);
      if (!vivo) return;
      setCarregando(false);
      if (r.ok) {
        setAps(r.valor);
        setErro("");
      } else setErro(r.erro);
    };
    void carregar();
    // Lançou, corrigiu ou parou um cronômetro em outra tela: refaz a conta.
    const ouvir = () => void carregar();
    window.addEventListener("adeke:tempo", ouvir);
    return () => {
      vivo = false;
      window.removeEventListener("adeke:tempo", ouvir);
    };
  }, [ini, fim]);

  const nomePessoa = (id: string) => perfis.find((p) => p.id === id)?.display_name || "Alguém";

  const filtrados = useMemo(() => {
    const termo = busca.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    return aps.filter((a) => {
      if (!allowedModules.includes(a.area_id)) return false;
      if (pessoa !== "todos" && a.user_id !== (pessoa === "eu" ? eu?.id : pessoa)) return false;
      if (area !== "todas" && a.area_id !== area) return false;
      if (!termo) return true;
      const texto =
        `${a.cliente_nome} ${a.item_nome} ${a.subitem_nome || ""} ${a.descricao} ${a.plano_nome}`
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase();
      return termo.split(/\s+/).every((t) => texto.includes(t));
    });
  }, [aps, allowedModules, pessoa, area, busca, eu]);

  const agora = new Date();
  const totais = useMemo(() => totalizar(filtrados, agora), [filtrados]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = somaSeg(filtrados, agora);
  const pessoasNoPeriodo = new Set(filtrados.map((a) => a.user_id)).size;
  const areasNoPeriodo = [...new Set(aps.map((a) => a.area_id))].filter((a) =>
    allowedModules.includes(a),
  );

  function alternar(chave: string) {
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });
  }

  function exportar() {
    const bytes = gerarXlsx(
      abasDaFolha(filtrados, { pessoa: nomePessoa, area: nomeArea }, new Date()),
    );
    const blob = new Blob([bytes as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const ultimoDia = new Date(fim.getTime() - 86400_000);
    const nome = `horas-${diaInput(ini)}-a-${diaInput(ultimoDia)}.xlsx`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = nome;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  return (
    <div style={{ padding: "28px 44px", fontFamily: "Outfit, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Timer size={18} color="#0F766E" />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0F172A", marginRight: 8 }}>
          Horas
        </h2>
        {(
          [
            ["semana", "Esta semana"],
            ["mes", "Este mês"],
            ["mesPassado", "Mês passado"],
            ["personalizado", "Período"],
          ] as const
        ).map(([p, rotulo]) => (
          <button key={p} onClick={() => setPeriodo(p)} style={botao(periodo === p)}>
            {rotulo}
          </button>
        ))}
        {periodo === "personalizado" && (
          <>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={campo} />
            <span style={{ fontSize: 12, color: "#64748B" }}>até</span>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={campo} />
          </>
        )}
        <span style={{ flex: 1 }} />
        <button
          onClick={exportar}
          disabled={!filtrados.length}
          style={{
            ...botao(false),
            display: "flex",
            alignItems: "center",
            gap: 6,
            opacity: filtrados.length ? 1 : 0.5,
          }}
          title="Planilha com cada lançamento (dia, início, fim, duração, o que foi feito) e os totais por cliente e por demanda"
        >
          <Download size={14} /> Exportar planilha
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} style={campo}>
          <option value="todos">Todas as pessoas</option>
          <option value="eu">Só eu</option>
          {perfis.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
        <select value={area} onChange={(e) => setArea(e.target.value)} style={campo}>
          <option value="todas">Todas as áreas</option>
          {areasNoPeriodo.map((a) => (
            <option key={a} value={a}>
              {nomeArea(a)}
            </option>
          ))}
        </select>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar por cliente, demanda ou descrição"
          style={{ ...campo, width: 280 }}
        />
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <Numero
          rotulo="Total no período"
          valor={formatarDuracao(total)}
          detalhe={`${horasDecimais(total).toLocaleString("pt-BR")} h`}
        />
        <Numero rotulo="Clientes" valor={String(totais.length)} />
        <Numero rotulo="Lançamentos" valor={String(filtrados.length)} />
        <Numero rotulo="Pessoas" valor={String(pessoasNoPeriodo)} />
      </div>

      {erro && <p style={{ color: "#DC2626", fontSize: 13 }}>{erro}</p>}
      {carregando && <p style={{ color: "#94A3B8", fontSize: 13 }}>Carregando...</p>}
      {!carregando && !erro && !filtrados.length && (
        <p style={{ color: "#64748B", fontSize: 13, marginTop: 24, lineHeight: 1.6 }}>
          Nenhum tempo lançado neste período. Para começar, abra um card e use{" "}
          <strong>Iniciar</strong> (cronômetro) ou <strong>Lançar</strong> (tempo que já passou).
        </p>
      )}

      {!!totais.length && (
        <div
          style={{
            marginTop: 18,
            border: "1px solid #E2E8F0",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              ...linhaBase,
              background: "#F8FAFC",
              fontWeight: 700,
              color: "#475569",
              fontSize: 11,
            }}
          >
            <span style={{ flex: 1 }}>CLIENTE / DEMANDA / SUBDEMANDA</span>
            <span style={{ width: 90, textAlign: "right" }}>TEMPO</span>
            <span style={{ width: 60, textAlign: "right" }}>HORAS</span>
            <span style={{ width: 120 }} />
          </div>
          {totais.map((c) => {
            const aberto = abertos.has(c.chave);
            return (
              <div key={c.chave}>
                <button
                  onClick={() => alternar(c.chave)}
                  style={{ ...linhaBase, ...linhaBotao, fontWeight: 700 }}
                >
                  {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span style={{ flex: 1, textAlign: "left" }}>
                    {c.nome}{" "}
                    <span style={{ fontWeight: 400, color: "#94A3B8" }}>
                      · {c.demandas.length} demanda{c.demandas.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  <Valores seg={c.seg} total={total} />
                </button>
                {aberto &&
                  c.demandas.map((d) => {
                    const chaveD = `${c.chave}|${d.itemId}`;
                    const comSub = d.subdemandas.some((s) => s.id);
                    const abertoD = abertos.has(chaveD);
                    return (
                      <div key={chaveD}>
                        <button
                          onClick={() => comSub && alternar(chaveD)}
                          style={{
                            ...linhaBase,
                            ...linhaBotao,
                            paddingLeft: 34,
                            cursor: comSub ? "pointer" : "default",
                          }}
                        >
                          {comSub ? (
                            abertoD ? (
                              <ChevronDown size={13} />
                            ) : (
                              <ChevronRight size={13} />
                            )
                          ) : (
                            <span style={{ width: 13 }} />
                          )}
                          <span style={{ flex: 1, textAlign: "left" }}>
                            {d.nome}{" "}
                            <span style={{ color: "#94A3B8" }}>
                              · {nomeArea(d.areaId)}
                              {d.planoNome ? ` · ${d.planoNome}` : ""}
                            </span>
                          </span>
                          <Valores seg={d.seg} total={total} />
                        </button>
                        {abertoD &&
                          d.subdemandas.map((s) => (
                            <div
                              key={s.id || "_"}
                              style={{ ...linhaBase, paddingLeft: 70, color: "#475569" }}
                            >
                              <span style={{ flex: 1 }}>{s.id ? s.nome : "Direto na demanda"}</span>
                              <Valores seg={s.seg} total={total} />
                            </div>
                          ))}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Valores({ seg, total }: { seg: number; total: number }) {
  const pct = total ? Math.round((seg / total) * 100) : 0;
  return (
    <>
      <span style={{ width: 90, textAlign: "right" }}>{formatarDuracao(seg)}</span>
      <span style={{ width: 60, textAlign: "right", color: "#64748B" }}>
        {horasDecimais(seg).toLocaleString("pt-BR")}
      </span>
      <span style={{ width: 120, display: "flex", alignItems: "center", gap: 6, paddingLeft: 12 }}>
        <span
          style={{ flex: 1, height: 5, background: "#E2E8F0", borderRadius: 3, overflow: "hidden" }}
        >
          <span
            style={{ display: "block", width: `${pct}%`, height: "100%", background: "#0F766E" }}
          />
        </span>
        <span style={{ fontSize: 10, color: "#94A3B8", width: 28 }}>{pct}%</span>
      </span>
    </>
  );
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div
      style={{
        border: "1px solid #E2E8F0",
        borderRadius: 10,
        padding: "10px 14px",
        minWidth: 130,
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>{rotulo}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A" }}>{valor}</div>
      {detalhe && <div style={{ fontSize: 11, color: "#94A3B8" }}>{detalhe}</div>}
    </div>
  );
}

const campo: CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  fontFamily: "inherit",
  color: "#0F172A",
  background: "#fff",
};
const linhaBase: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 14px",
  borderTop: "1px solid #F1F5F9",
  fontSize: 13,
  color: "#0F172A",
};
const linhaBotao: CSSProperties = {
  width: "100%",
  background: "#fff",
  border: "none",
  borderTop: "1px solid #F1F5F9",
  cursor: "pointer",
  fontFamily: "inherit",
};

function botao(ativo: boolean): CSSProperties {
  return {
    background: ativo ? "#0F766E" : "#fff",
    color: ativo ? "#fff" : "#334155",
    border: `1px solid ${ativo ? "#0F766E" : "#E2E8F0"}`,
    borderRadius: 8,
    padding: "6px 11px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
