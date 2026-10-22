// O tempo dentro do card: cronômetro, lançamento à mão e o histórico.
//
// O caminho comum é um clique: "Iniciar" e, ao terminar, "Parar" — com uma
// linha opcional do que foi feito. Quem esqueceu de ligar lança depois: o dia,
// de que horas a que horas (ou só a duração, que preenche o fim sozinha) e o
// que era. Os totais aparecem por subdemanda (itens da checklist) quando houver
// tempo nelas, e o card soma tudo.

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Clock, Play, Square, Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import {
  apagarTempo,
  corrigirTempo,
  iniciarCronometro,
  lancarTempo,
  pararCronometro,
  useAgora,
  useApontamentosDoItem,
  useCronometro,
} from "@/lib/apontamentos";
import {
  ALERTA_SEG,
  combinarDataHora,
  duracaoSeg,
  erroNoIntervalo,
  formatarDuracao,
  formatarRelogio,
  lerDuracao,
  somaSeg,
  totalizar,
  type AlvoDoTempo,
  type Apontamento,
} from "@/lib/tempo";

export type Subdemanda = { id: string; text: string };

type Props = {
  alvo: AlvoDoTempo;
  subdemandas: Subdemanda[];
  userId: string | null;
  ehAdmin: boolean;
  nomePessoa: (id: string) => string;
};

function doisDigitos(n: number) {
  return String(n).padStart(2, "0");
}
function diaLocal(d: Date) {
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}
function horaLocal(d: Date) {
  return `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}
/** Arredonda para baixo em múltiplos de 5 minutos: ninguém lembra das 14:37. */
function arredondar5(d: Date) {
  const x = new Date(d);
  x.setSeconds(0, 0);
  x.setMinutes(Math.floor(x.getMinutes() / 5) * 5);
  return x;
}

export default function TempoDoCard({ alvo, subdemandas, userId, ehAdmin, nomePessoa }: Props) {
  const { ativo, disponivel } = useCronometro(userId);
  const { lista, carregado } = useApontamentosDoItem(alvo.item_id);
  const rodandoAqui = !!ativo && ativo.item_id === alvo.item_id;
  const agora = useAgora(rodandoAqui || lista.some((a) => !a.fim));

  const [sub, setSub] = useState("");
  const [fazendo, setFazendo] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [verTodos, setVerTodos] = useState(false);

  // O que a pessoa escreveu enquanto o cronômetro anda vai junto ao parar.
  useEffect(() => {
    if (rodandoAqui) setFazendo(ativo?.descricao || "");
  }, [rodandoAqui, ativo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = useMemo(() => somaSeg(lista, agora), [lista, agora]);
  const meu = useMemo(
    () =>
      somaSeg(
        lista.filter((a) => a.user_id === userId),
        agora,
      ),
    [lista, userId, agora],
  );
  const porSub = useMemo(() => {
    const [demanda] = totalizar(lista, agora).flatMap((c) => c.demandas);
    return (demanda?.subdemandas || []).filter((s) => s.id);
  }, [lista, agora]);

  if (disponivel === false) return null;

  const nomeSub = (id: string) => subdemandas.find((s) => s.id === id)?.text || null;

  async function iniciar(subId = sub) {
    setErro("");
    const r = await iniciarCronometro({
      ...alvo,
      subitem_id: subId || null,
      subitem_nome: subId ? nomeSub(subId) : null,
    });
    if (!r.ok) setErro(r.erro);
  }

  async function parar() {
    setErro("");
    if (ativo && duracaoSeg(ativo, new Date()) > ALERTA_SEG) {
      // Ligado há mais de 10 horas: provavelmente esquecido. Abre a correção
      // em vez de gravar um dia inteiro de trabalho que não aconteceu.
      setEditando(ativo.id);
      return;
    }
    const r = await pararCronometro(fazendo.trim());
    if (!r.ok) setErro(r.erro);
    else setFazendo("");
  }

  const visiveis = verTodos ? lista : lista.slice(0, 6);
  const podeMexer = (a: Apontamento) => ehAdmin || a.user_id === userId;

  return (
    <div style={caixa}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Clock size={15} color="#0F766E" />
        <strong style={{ fontSize: 13, color: "#0F172A" }}>Tempo</strong>
        <span style={{ fontSize: 12, color: "#475569" }}>
          {formatarDuracao(total)} no total
          {userId && meu > 0 && meu !== total ? ` · ${formatarDuracao(meu)} seu` : ""}
        </span>
        <span style={{ flex: 1 }} />

        {rodandoAqui ? (
          <>
            <input
              value={fazendo}
              onChange={(e) => setFazendo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void parar()}
              placeholder="O que você está fazendo? (opcional)"
              style={{ ...campo, width: 230 }}
            />
            <button onClick={() => void parar()} style={botaoParar} title="Parar e gravar o tempo">
              <Square size={11} fill="#fff" /> Parar {formatarRelogio(duracaoSeg(ativo!, agora))}
            </button>
          </>
        ) : (
          <>
            {subdemandas.length > 0 && (
              <select
                value={sub}
                onChange={(e) => setSub(e.target.value)}
                style={{ ...campo, maxWidth: 200 }}
                title="Em que parte da demanda você vai trabalhar"
              >
                <option value="">Demanda inteira</option>
                {subdemandas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.text}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => void iniciar()}
              style={botaoIniciar}
              title={
                ativo
                  ? `Seu cronômetro está em "${ativo.item_nome}". Iniciar aqui encerra aquele.`
                  : "Começar a contar o tempo nesta demanda"
              }
            >
              <Play size={11} fill="#fff" /> Iniciar
            </button>
          </>
        )}
        <button
          onClick={() => {
            setFormAberto((v) => !v);
            setEditando(null);
          }}
          style={botaoLeve}
          title="Lançar um tempo que já passou"
        >
          <Plus size={12} /> Lançar
        </button>
      </div>

      {ativo && !rodandoAqui && (
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#64748B" }}>
          Seu cronômetro está rodando em “{ativo.item_nome}”. Iniciar aqui encerra aquele.
        </p>
      )}
      {erro && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#DC2626" }}>{erro}</p>}

      {formAberto && (
        <FormularioTempo
          subdemandas={subdemandas}
          subInicial={sub}
          onCancelar={() => setFormAberto(false)}
          onSalvar={async (v) => {
            const r = await lancarTempo(
              {
                ...alvo,
                subitem_id: v.subId || null,
                subitem_nome: v.subId ? nomeSub(v.subId) : null,
              },
              v.inicio,
              v.fim,
              v.descricao,
            );
            if (r.ok) setFormAberto(false);
            return r.ok ? null : r.erro;
          }}
        />
      )}

      {porSub.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {porSub.map((s) => (
            <span key={s.id} style={etiqueta}>
              {nomeSub(s.id!) || s.nome} · <strong>{formatarDuracao(s.seg)}</strong>
            </span>
          ))}
        </div>
      )}

      {carregado && lista.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {visiveis.map((a) =>
            editando === a.id ? (
              <FormularioTempo
                key={a.id}
                subdemandas={subdemandas}
                existente={a}
                subInicial={a.subitem_id || ""}
                onCancelar={() => setEditando(null)}
                onSalvar={async (v) => {
                  const r = await corrigirTempo(a.id, {
                    inicio: v.inicio.toISOString(),
                    fim: v.fim.toISOString(),
                    descricao: v.descricao,
                    subitem_id: v.subId || null,
                    subitem_nome: v.subId ? nomeSub(v.subId) : null,
                  });
                  if (r.ok) setEditando(null);
                  return r.ok ? null : r.erro;
                }}
              />
            ) : (
              <LinhaTempo
                key={a.id}
                a={a}
                agora={agora}
                pessoa={nomePessoa(a.user_id)}
                subNome={a.subitem_id ? nomeSub(a.subitem_id) || a.subitem_nome : null}
                podeMexer={podeMexer(a)}
                apagando={apagando === a.id}
                onEditar={() => {
                  setEditando(a.id);
                  setFormAberto(false);
                }}
                onApagar={() => setApagando(a.id)}
                onConfirmarApagar={async () => {
                  const r = await apagarTempo(a.id);
                  setApagando(null);
                  if (!r.ok) setErro(r.erro);
                }}
                onCancelarApagar={() => setApagando(null)}
              />
            ),
          )}
          {lista.length > visiveis.length && (
            <button
              onClick={() => setVerTodos(true)}
              style={{ ...botaoLeve, alignSelf: "flex-start" }}
            >
              Ver os {lista.length} lançamentos
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LinhaTempo({
  a,
  agora,
  pessoa,
  subNome,
  podeMexer,
  apagando,
  onEditar,
  onApagar,
  onConfirmarApagar,
  onCancelarApagar,
}: {
  a: Apontamento;
  agora: Date;
  pessoa: string;
  subNome: string | null;
  podeMexer: boolean;
  apagando: boolean;
  onEditar: () => void;
  onApagar: () => void;
  onConfirmarApagar: () => void;
  onCancelarApagar: () => void;
}) {
  const ini = new Date(a.inicio);
  const fim = a.fim ? new Date(a.fim) : null;
  const seg = duracaoSeg(a, agora);
  return (
    <div style={linha}>
      <span style={{ width: 74, color: "#475569" }}>
        {doisDigitos(ini.getDate())}/{doisDigitos(ini.getMonth() + 1)}
      </span>
      <span style={{ width: 92, color: "#475569" }}>
        {horaLocal(ini)}–{fim ? horaLocal(fim) : "agora"}
      </span>
      <strong style={{ width: 78, color: fim ? "#0F172A" : "#DC2626" }}>
        {fim ? formatarDuracao(seg) : formatarRelogio(seg)}
      </strong>
      <span style={{ width: 110, color: "#334155", overflow: "hidden", textOverflow: "ellipsis" }}>
        {pessoa}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          color: "#334155",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {subNome && <span style={etiqueta}>{subNome}</span>} {a.descricao}
      </span>
      {seg > ALERTA_SEG && (
        <span title="Mais de 10 horas: confira se o cronômetro não ficou ligado">
          <AlertTriangle size={13} color="#D97706" />
        </span>
      )}
      {podeMexer &&
        (apagando ? (
          <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
            Apagar?
            <button onClick={onConfirmarApagar} style={{ ...botaoLeve, color: "#DC2626" }}>
              Sim
            </button>
            <button onClick={onCancelarApagar} style={botaoLeve}>
              Não
            </button>
          </span>
        ) : (
          <span style={{ display: "flex", gap: 2 }}>
            <button onClick={onEditar} style={icone} title="Corrigir">
              <Pencil size={12} color="#64748B" />
            </button>
            <button onClick={onApagar} style={icone} title="Apagar">
              <Trash2 size={12} color="#94A3B8" />
            </button>
          </span>
        ))}
    </div>
  );
}

type ValoresForm = { subId: string; inicio: Date; fim: Date; descricao: string };

/**
 * Lançar ou corrigir um intervalo.
 *
 * Início e fim, ou início e duração — o que for mais fácil de lembrar. Mudar a
 * duração empurra o fim; mudar o fim recalcula a duração. Embaixo, a leitura
 * por extenso do que vai ser gravado.
 */
function FormularioTempo({
  subdemandas,
  subInicial,
  existente,
  onSalvar,
  onCancelar,
}: {
  subdemandas: Subdemanda[];
  subInicial: string;
  existente?: Apontamento;
  onSalvar: (v: ValoresForm) => Promise<string | null>;
  onCancelar: () => void;
}) {
  const [valores] = useState(() => {
    if (existente) {
      const ini = new Date(existente.inicio);
      // Cronômetro esquecido: sugere o fim no teto razoável, para a pessoa ajustar.
      const fim = existente.fim
        ? new Date(existente.fim)
        : new Date(Math.min(Date.now(), ini.getTime() + 8 * 3600_000));
      return { ini, fim };
    }
    const fim = arredondar5(new Date());
    return { ini: new Date(fim.getTime() - 3600_000), fim };
  });
  const [subId, setSubId] = useState(subInicial);
  const [dia, setDia] = useState(diaLocal(valores.ini));
  const [inicio, setInicio] = useState(horaLocal(valores.ini));
  const [fim, setFim] = useState(horaLocal(valores.fim));
  const [duracao, setDuracao] = useState(
    formatarDuracao(Math.round((valores.fim.getTime() - valores.ini.getTime()) / 1000)).replace(
      /\s/g,
      "",
    ),
  );
  const [descricao, setDescricao] = useState(existente?.descricao || "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  // O fim no dia seguinte quando o horário atravessa a meia-noite.
  const dIni = combinarDataHora(dia, inicio);
  let dFim = combinarDataHora(dia, fim);
  if (dIni && dFim && dFim <= dIni) dFim = new Date(dFim.getTime() + 86400_000);
  const problema = erroNoIntervalo(dIni, dFim);
  const seg = dIni && dFim ? Math.round((dFim.getTime() - dIni.getTime()) / 1000) : 0;

  function mudarDuracao(texto: string) {
    setDuracao(texto);
    const s = lerDuracao(texto);
    if (s && dIni) setFim(horaLocal(new Date(dIni.getTime() + s * 1000)));
  }
  function mudarFim(h: string) {
    setFim(h);
    const f = combinarDataHora(dia, h);
    if (f && dIni) {
      const s = (f.getTime() - dIni.getTime()) / 1000;
      setDuracao(formatarDuracao(s > 0 ? s : s + 86400).replace(/\s/g, ""));
    }
  }
  function mudarInicio(h: string) {
    setInicio(h);
    const s = lerDuracao(duracao);
    const i = combinarDataHora(dia, h);
    if (s && i) setFim(horaLocal(new Date(i.getTime() + s * 1000)));
  }

  async function salvar() {
    if (problema || !dIni || !dFim) {
      setErro(problema || "Confira os horários.");
      return;
    }
    setSalvando(true);
    const e = await onSalvar({ subId, inicio: dIni, fim: dFim, descricao: descricao.trim() });
    setSalvando(false);
    if (e) setErro(e);
  }

  const lida = lerDuracao(duracao);
  return (
    <div style={{ ...caixa, background: "#F8FAFC", marginTop: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        {subdemandas.length > 0 && (
          <Campo rotulo="Subdemanda">
            <select
              value={subId}
              onChange={(e) => setSubId(e.target.value)}
              style={{ ...campo, maxWidth: 190 }}
            >
              <option value="">Demanda inteira</option>
              {subdemandas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.text}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <Campo rotulo="Dia">
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} style={campo} />
        </Campo>
        <Campo rotulo="Início">
          <input
            type="time"
            value={inicio}
            onChange={(e) => mudarInicio(e.target.value)}
            style={campo}
          />
        </Campo>
        <Campo rotulo="Fim">
          <input type="time" value={fim} onChange={(e) => mudarFim(e.target.value)} style={campo} />
        </Campo>
        <Campo rotulo="Duração">
          <input
            value={duracao}
            onChange={(e) => mudarDuracao(e.target.value)}
            placeholder="1h30"
            title='Aceita "1h30", "1:30", "90min", "1,5"'
            style={{ ...campo, width: 76 }}
          />
        </Campo>
      </div>
      <input
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void salvar()}
        placeholder="O que foi feito (ex.: revisão da minuta e ligação com o cliente)"
        style={{ ...campo, width: "100%", marginTop: 8, boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        <span style={{ fontSize: 11, color: problema ? "#DC2626" : "#64748B", flex: 1 }}>
          {problema
            ? problema
            : `${formatarDuracao(seg)}, das ${inicio} às ${fim}${
                dFim && dIni && dFim.getDate() !== dIni.getDate() ? " do dia seguinte" : ""
              }${duracao && !lida ? ' · não entendi a duração; use "1h30"' : ""}`}
        </span>
        {erro && !problema && <span style={{ fontSize: 11, color: "#DC2626" }}>{erro}</span>}
        <button onClick={onCancelar} style={botaoLeve}>
          Cancelar
        </button>
        <button onClick={() => void salvar()} disabled={salvando} style={botaoIniciar}>
          {existente ? "Salvar correção" : "Lançar"}
        </button>
      </div>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        fontSize: 10,
        color: "#64748B",
        fontWeight: 600,
      }}
    >
      {rotulo}
      {children}
    </label>
  );
}

const caixa: CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fff",
  fontFamily: "inherit",
};
const campo: CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 7,
  padding: "5px 8px",
  fontSize: 12,
  fontFamily: "inherit",
  color: "#0F172A",
  background: "#fff",
  outline: "none",
};
const botaoBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  border: "none",
  borderRadius: 7,
  padding: "6px 11px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};
const botaoIniciar: CSSProperties = { ...botaoBase, background: "#0F766E", color: "#fff" };
const botaoParar: CSSProperties = { ...botaoBase, background: "#DC2626", color: "#fff" };
const botaoLeve: CSSProperties = {
  ...botaoBase,
  background: "#F1F5F9",
  color: "#334155",
  fontWeight: 600,
  padding: "5px 9px",
};
const icone: CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 3,
  lineHeight: 0,
};
const etiqueta: CSSProperties = {
  background: "#F0FDFA",
  border: "1px solid #CCFBF1",
  color: "#0F766E",
  borderRadius: 999,
  padding: "1px 8px",
  fontSize: 11,
};
const linha: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  padding: "4px 6px",
  borderRadius: 6,
  background: "#F8FAFC",
  whiteSpace: "nowrap",
};
