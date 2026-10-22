// Arrumar o cadastro: clientes repetidos, nomes fora do padrão e demandas
// duplicadas, num lugar só.
//
// Cada seção mostra o que mudaria e só grava quando a pessoa clica. As regras
// moram em lib/padronizacao.ts; esta tela é só o antes, o depois e o botão.

import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, Sparkles, Trash2 } from "lucide-react";
import type { DashboardState } from "@/lib/dashboardTypes";
import { clientesAtivos } from "@/lib/diretorioClientes";
import {
  apagarCliente,
  apagarDemanda,
  aplicarNomes,
  clientesParecidos,
  demandasDoCliente,
  demandasRepetidas,
  marcarDiferentes,
  marcarMesmoGrupo,
  propostasDeNome,
  unirClientes,
  type PropostaNome,
} from "@/lib/padronizacao";
import { areaById } from "@/lib/areas";
import { corDoEstado } from "@/lib/etapas";

type Props = {
  data: DashboardState;
  setData: (updater: (d: DashboardState) => DashboardState) => void;
  abrirCard: (c: { areaId: string; clienteId: string; planoId: string; itemId: string }) => void;
  irParaTriagem: () => void;
};

export default function ArrumarCadastro({ data, setData, abrirCard, irParaTriagem }: Props) {
  const [feito, setFeito] = useState("");
  const pares = useMemo(() => clientesParecidos(data), [data]);
  const nomes = useMemo(() => propostasDeNome(data), [data]);
  const repetidas = useMemo(() => demandasRepetidas(data), [data]);
  const clientes = useMemo(() => clientesAtivos(data), [data]);
  const contar = (id: string) => demandasDoCliente(data, id);

  function fazer(mudar: (d: DashboardState) => DashboardState, mensagem: string) {
    setData(mudar);
    setFeito(mensagem);
  }

  return (
    <div style={{ fontFamily: "Outfit, sans-serif", maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Sparkles size={20} color="#0F766E" />
        <h2 style={{ color: "#0F172A", fontSize: 20, fontWeight: 800, margin: 0 }}>
          Arrumar cadastro
        </h2>
      </div>
      <p style={{ color: "#64748B", fontSize: 13, margin: "4px 0 16px" }}>
        Clientes repetidos, nomes fora do padrão e demandas duplicadas. Nada muda até você clicar.
      </p>
      {feito && (
        <p style={ok}>
          <Check size={13} style={{ verticalAlign: -2 }} /> {feito}
        </p>
      )}

      <Secao titulo="Clientes parecidos" n={pares.length} abertaDeInicio>
        {!pares.length && <Vazio>Nenhum par de nomes parecidos sem resposta.</Vazio>}
        {pares.map(({ a, b, motivo }) => (
          <ParDeClientes
            key={`${a.id}|${b.id}`}
            a={{ id: a.id, nome: a.nome, n: contar(a.id) }}
            b={{ id: b.id, nome: b.nome, n: contar(b.id) }}
            motivo={motivo}
            onUnir={(fica, sai) =>
              fazer(
                (d) => unirClientes(d, fica.id, sai.id),
                `"${sai.nome}" unido a "${fica.nome}" (${sai.n} demandas movidas)`,
              )
            }
            onGrupo={(grupo) =>
              fazer(
                (d) => marcarMesmoGrupo(d, a.id, b.id, grupo),
                `${a.nome} e ${b.nome} marcados como Grupo ${grupo}`,
              )
            }
            onDiferentes={() =>
              fazer((d) => marcarDiferentes(d, a.id, b.id), `${a.nome} e ${b.nome} são diferentes`)
            }
          />
        ))}
        <UnirManual
          clientes={clientes.map((c) => ({ id: c.id, nome: c.nome, n: contar(c.id) }))}
          onUnir={(fica, sai) =>
            fazer(
              (d) => unirClientes(d, fica.id, sai.id),
              `"${sai.nome}" unido a "${fica.nome}" (${sai.n} demandas movidas)`,
            )
          }
        />
      </Secao>

      <Secao titulo="Nomes fora do padrão" n={nomes.length}>
        <ListaDeNomes
          propostas={nomes}
          onAplicar={(escolhidas) =>
            fazer((d) => aplicarNomes(d, escolhidas), `${escolhidas.length} nomes padronizados`)
          }
        />
      </Secao>

      <Secao titulo="Demandas repetidas no mesmo cliente" n={repetidas.length}>
        {!repetidas.length && <Vazio>Nenhuma demanda repetida.</Vazio>}
        {repetidas.map((g) => (
          <div key={g.chave} style={{ padding: "10px 0", borderTop: "1px solid #F1F5F9" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
              {g.nome}{" "}
              <span style={{ fontWeight: 400, color: "#94A3B8" }}>
                · {g.cliente} · {g.itens.length}×
              </span>
            </div>
            {g.itens.map((o) => (
              <LinhaRepetida
                key={o.item.id}
                areaNome={areaById(o.areaId)?.modulo || o.areaId}
                item={o.item}
                onAbrir={() =>
                  abrirCard({
                    areaId: o.areaId,
                    clienteId: o.vinculoId,
                    planoId: o.planoId,
                    itemId: o.item.id,
                  })
                }
                onApagar={() =>
                  fazer((d) => apagarDemanda(d, o.item.id), `Demanda "${o.item.name}" apagada`)
                }
              />
            ))}
          </div>
        ))}
      </Secao>

      <Secao titulo="Apagar cliente">
        <ApagarCliente
          clientes={clientes.map((c) => ({ id: c.id, nome: c.nome, n: contar(c.id) }))}
          onApagar={(c) =>
            fazer((d) => apagarCliente(d, c.id), `"${c.nome}" e ${c.n} demandas apagados`)
          }
        />
      </Secao>

      <p style={{ fontSize: 12, color: "#64748B", marginTop: 16 }}>
        Demandas sem responsável ou sem prazo se resolvem na{" "}
        <button onClick={irParaTriagem} style={{ ...link }}>
          Triagem
        </button>
        .
      </p>
    </div>
  );
}

type ClienteResumo = { id: string; nome: string; n: number };

function ParDeClientes({
  a,
  b,
  motivo,
  onUnir,
  onGrupo,
  onDiferentes,
}: {
  a: ClienteResumo;
  b: ClienteResumo;
  motivo: string;
  onUnir: (fica: ClienteResumo, sai: ClienteResumo) => void;
  onGrupo: (grupo: string) => void;
  onDiferentes: () => void;
}) {
  const [grupo, setGrupo] = useState<string | null>(null);
  // Sugere manter o que tem mais demandas (normalmente a grafia certa).
  const [maior, menor] = a.n >= b.n ? [a, b] : [b, a];
  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid #F1F5F9" }}>
      <div style={{ fontSize: 13, color: "#0F172A" }}>
        <strong>{a.nome}</strong> <span style={cinza}>({a.n})</span> e <strong>{b.nome}</strong>{" "}
        <span style={cinza}>({b.n})</span>{" "}
        <span style={{ ...cinza, fontSize: 11 }}>· {motivo}</span>
      </div>
      <div
        style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}
      >
        <button onClick={() => onUnir(maior, menor)} style={botaoPrincipal}>
          Unir em “{maior.nome}”
        </button>
        <button onClick={() => onUnir(menor, maior)} style={botao}>
          Unir em “{menor.nome}”
        </button>
        {grupo === null ? (
          <button onClick={() => setGrupo(a.nome.split(" ")[0])} style={botao}>
            Diferentes, mesmo grupo
          </button>
        ) : (
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#475569" }}>Grupo</span>
            <input
              value={grupo}
              onChange={(e) => setGrupo(e.target.value)}
              style={{ ...campo, width: 120 }}
            />
            <button disabled={!grupo.trim()} onClick={() => onGrupo(grupo)} style={botaoPrincipal}>
              Salvar
            </button>
          </span>
        )}
        <button onClick={onDiferentes} style={botao}>
          Não têm relação
        </button>
      </div>
    </div>
  );
}

function UnirManual({
  clientes,
  onUnir,
}: {
  clientes: ClienteResumo[];
  onUnir: (fica: ClienteResumo, sai: ClienteResumo) => void;
}) {
  const [sai, setSai] = useState("");
  const [fica, setFica] = useState("");
  const cSai = clientes.find((c) => c.id === sai);
  const cFica = clientes.find((c) => c.id === fica);
  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px dashed #E2E8F0",
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <span style={{ fontSize: 12, color: "#475569" }}>Unir outro:</span>
      <select
        value={sai}
        onChange={(e) => setSai(e.target.value)}
        style={{ ...campo, minWidth: 200 }}
      >
        <option value="">cliente que sai…</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome} ({c.n})
          </option>
        ))}
      </select>
      <span style={{ fontSize: 12, color: "#475569" }}>entra em</span>
      <select
        value={fica}
        onChange={(e) => setFica(e.target.value)}
        style={{ ...campo, minWidth: 200 }}
      >
        <option value="">cliente que fica…</option>
        {clientes
          .filter((c) => c.id !== sai)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} ({c.n})
            </option>
          ))}
      </select>
      <button
        disabled={!cSai || !cFica}
        onClick={() => {
          if (!cSai || !cFica) return;
          onUnir(cFica, cSai);
          setSai("");
          setFica("");
        }}
        style={cSai && cFica ? botaoPrincipal : { ...botaoPrincipal, ...desligado }}
      >
        Unir
      </button>
    </div>
  );
}

function ListaDeNomes({
  propostas,
  onAplicar,
}: {
  propostas: PropostaNome[];
  onAplicar: (escolhidas: PropostaNome[]) => void;
}) {
  const [fora, setFora] = useState<Set<string>>(new Set());
  const [editados, setEditados] = useState<Record<string, string>>({});
  const [tipo, setTipo] = useState<"cliente" | "demanda">("cliente");
  const visiveis = propostas.filter((p) => p.tipo === tipo);
  const escolhidas = propostas
    .filter((p) => !fora.has(p.chave))
    .map((p) => (editados[p.chave] ? { ...p, depois: editados[p.chave] } : p));
  const nClientes = propostas.filter((p) => p.tipo === "cliente").length;

  if (!propostas.length) return <Vazio>Todos os nomes já estão no padrão.</Vazio>;
  return (
    <div>
      <div
        style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}
      >
        <button
          onClick={() => setTipo("cliente")}
          style={tipo === "cliente" ? botaoPrincipal : botao}
        >
          Clientes ({nClientes})
        </button>
        <button
          onClick={() => setTipo("demanda")}
          style={tipo === "demanda" ? botaoPrincipal : botao}
        >
          Demandas ({propostas.length - nClientes})
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "#64748B" }}>
          Desmarque o que não quiser; dá para corrigir o nome sugerido.
        </span>
        <button
          onClick={() => onAplicar(escolhidas)}
          disabled={!escolhidas.length}
          style={botaoPrincipal}
        >
          Aplicar {escolhidas.length}
        </button>
      </div>
      <div
        style={{ maxHeight: 360, overflowY: "auto", border: "1px solid #F1F5F9", borderRadius: 8 }}
      >
        {visiveis.map((p) => (
          <label
            key={p.chave}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 10px",
              fontSize: 12,
              borderBottom: "1px solid #F8FAFC",
            }}
          >
            <input
              type="checkbox"
              checked={!fora.has(p.chave)}
              onChange={() =>
                setFora((s) => {
                  const n = new Set(s);
                  if (n.has(p.chave)) n.delete(p.chave);
                  else n.add(p.chave);
                  return n;
                })
              }
            />
            <span
              style={{
                flex: 1,
                color: "#94A3B8",
                textDecoration: "line-through",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {p.antes}
            </span>
            <input
              value={editados[p.chave] ?? p.depois}
              onChange={(e) => setEditados((m) => ({ ...m, [p.chave]: e.target.value }))}
              style={{ ...campo, flex: 1.3 }}
            />
            {p.onde && (
              <span
                style={{
                  ...cinza,
                  fontSize: 11,
                  width: 120,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {p.onde}
              </span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

function LinhaRepetida({
  areaNome,
  item,
  onAbrir,
  onApagar,
}: {
  areaNome: string;
  item: {
    id: string;
    name: string;
    kanbanStatus?: string;
    status?: string;
    criadoEm?: string;
    comentarios?: unknown[];
    prazo?: string;
  };
  onAbrir: () => void;
  onApagar: () => void;
}) {
  const [confirmar, setConfirmar] = useState(false);
  const estado = String(item.kanbanStatus || item.status || "");
  const criado = item.criadoEm ? new Date(item.criadoEm).toLocaleDateString("pt-BR") : "—";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 12,
        padding: "4px 0 4px 12px",
      }}
    >
      <button onClick={onAbrir} style={{ ...link, flex: 1, textAlign: "left" }}>
        {areaNome} · criado em {criado}
      </button>
      <span style={{ color: corDoEstado(estado), fontWeight: 700 }}>{estado || "—"}</span>
      <span style={cinza}>{(item.comentarios || []).length} coment.</span>
      <span style={cinza}>{item.prazo || "sem prazo"}</span>
      {confirmar ? (
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center", color: "#B91C1C" }}>
          Apagar esta?
          <button onClick={onApagar} style={{ ...botao, color: "#B91C1C" }}>
            Sim
          </button>
          <button onClick={() => setConfirmar(false)} style={botao}>
            Não
          </button>
        </span>
      ) : (
        <button onClick={() => setConfirmar(true)} style={botao} title="Apagar esta cópia">
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

function ApagarCliente({
  clientes,
  onApagar,
}: {
  clientes: ClienteResumo[];
  onApagar: (c: ClienteResumo) => void;
}) {
  const [id, setId] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const c = clientes.find((x) => x.id === id);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <select
        value={id}
        onChange={(e) => {
          setId(e.target.value);
          setConfirmar(false);
        }}
        style={{ ...campo, minWidth: 240 }}
      >
        <option value="">Escolha o cliente…</option>
        {clientes.map((x) => (
          <option key={x.id} value={x.id}>
            {x.nome} ({x.n} demandas)
          </option>
        ))}
      </select>
      {c &&
        (confirmar ? (
          <>
            <span style={{ fontSize: 12, color: "#B91C1C" }}>
              Apagar “{c.nome}” e as {c.n} demandas dele, em todas as áreas? Não dá para desfazer.
            </span>
            <button
              onClick={() => {
                onApagar(c);
                setId("");
                setConfirmar(false);
              }}
              style={{ ...botaoPrincipal, background: "#B91C1C" }}
            >
              Apagar cliente
            </button>
            <button onClick={() => setConfirmar(false)} style={botao}>
              Cancelar
            </button>
          </>
        ) : (
          <button onClick={() => setConfirmar(true)} style={botao}>
            <Trash2 size={12} /> Apagar…
          </button>
        ))}
    </div>
  );
}

function Secao({
  titulo,
  n,
  abertaDeInicio,
  children,
}: {
  titulo: string;
  n?: number;
  abertaDeInicio?: boolean;
  children: ReactNode;
}) {
  const [aberta, setAberta] = useState(!!abertaDeInicio);
  return (
    <div
      style={{ border: "1px solid #E2E8F0", borderRadius: 10, marginTop: 10, background: "#fff" }}
    >
      <button
        onClick={() => setAberta((v) => !v)}
        style={{
          ...semEstilo,
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 14px",
        }}
      >
        {aberta ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{titulo}</span>
        {n !== undefined && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: n ? "#B45309" : "#15803D",
              background: n ? "#FFFBEB" : "#F0FDF4",
              borderRadius: 6,
              padding: "2px 7px",
            }}
          >
            {n || "ok"}
          </span>
        )}
      </button>
      {aberta && <div style={{ padding: "0 14px 12px" }}>{children}</div>}
    </div>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return <p style={{ fontSize: 12, color: "#64748B", margin: "4px 0" }}>{children}</p>;
}

const semEstilo: CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  padding: 0,
};
const cinza: CSSProperties = { color: "#94A3B8" };
const link: CSSProperties = {
  ...semEstilo,
  color: "#0F766E",
  fontSize: 12,
  textDecoration: "underline",
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
const botao: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 7,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 600,
  color: "#334155",
  cursor: "pointer",
  fontFamily: "inherit",
};
const botaoPrincipal: CSSProperties = {
  ...botao,
  background: "#0F766E",
  borderColor: "#0F766E",
  color: "#fff",
};
const desligado: CSSProperties = { opacity: 0.5, cursor: "not-allowed" };
const ok: CSSProperties = {
  background: "#F0FDF4",
  border: "1px solid #BBF7D0",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12,
  color: "#166534",
  margin: "0 0 8px",
};
