// O Comercial visto como funil, em vez das 7 colunas de Kanban das outras áreas.
//
// Mesma árvore de dados, outra leitura: aqui um item é um negócio e a coluna é
// a etapa da venda. Arrastar entre colunas grava a etapa e o kanbanStatus
// derivado, então o Quadro Geral e os relatórios continuam vendo o mesmo card.

import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Clock, XCircle, RotateCcw, CalendarClock, Plus } from "lucide-react";
import {
  montarFunil,
  negociosDoFunil,
  resumoDoFunil,
  conversaoPorEtapa,
  negociosParados,
  porOrigem,
  mudarEtapa,
  reabrirNegocio,
  formatarValor,
  formatarValorCurto,
  corDaTemperatura,
  podeVerValores,
  criarNegocio,
  empresasDoComercial,
  lerValor,
  ETAPAS,
  TEMPERATURAS,
  ORIGENS,
  TEMPERATURA_PADRAO,
  PRIMEIRA_ETAPA,
  type Negocio,
} from "@/lib/comercial";
import type { DashboardState, Area, Cliente, Plano, Item } from "@/lib/dashboardTypes";
import { useProfiles, initials, colorFor, type Profile } from "@/lib/profiles";
import { useCurrentUser } from "@/lib/useCurrentUser";
import ItemModal from "@/components/ItemModal";
import { proximoPasso } from "@/lib/registros";

const DIAS_PARADO_ALERTA = 14;

type Props = {
  data: DashboardState;
  setData: (updater: (d: DashboardState) => DashboardState) => void;
};

export default function FunilComercial({ data, setData }: Props) {
  const profiles = useProfiles();
  const me = useCurrentUser();
  const meuPerfil = me ? profiles.find((p) => p.id === me.id) : null;
  const verValores = podeVerValores(meuPerfil);

  const [arrastando, setArrastando] = useState<Negocio | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const [aberto, setAberto] = useState<Negocio | null>(null);
  const [painel, setPainel] = useState<"conversao" | "origem" | "perdidos">("conversao");
  const [criando, setCriando] = useState(false);
  const [novo, setNovo] = useState({
    clienteId: "",
    nome: "",
    etapa: PRIMEIRA_ETAPA,
    valor: "",
    temperatura: TEMPERATURA_PADRAO,
    origem: "",
  });
  const empresas = useMemo(() => empresasDoComercial(data), [data]);

  const negocios = useMemo(() => negociosDoFunil(data), [data]);
  const funil = useMemo(() => montarFunil(negocios), [negocios]);
  const resumo = useMemo(() => resumoDoFunil(negocios), [negocios]);
  const conversao = useMemo(() => conversaoPorEtapa(negocios), [negocios]);
  const parados = useMemo(() => negociosParados(negocios, DIAS_PARADO_ALERTA), [negocios]);
  const origens = useMemo(() => porOrigem(negocios), [negocios]);
  const perdidos = useMemo(() => negocios.filter((n) => n.perdido), [negocios]);

  /**
   * Negócio vivo sem próximo passo marcado.
   *
   * É o vazamento silencioso do funil: ninguém decidiu perder, só pararam de
   * dar retorno. Fechamento e pós-venda ficam de fora — lá o combinado já foi
   * feito e cobrar retorno não faz sentido.
   */
  const semProximoPasso = useMemo(
    () =>
      negocios.filter(
        (n) =>
          !n.perdido && n.etapa !== "fechamento" && n.etapa !== "posVenda" && !proximoPasso(n.item),
      ),
    [negocios],
  );

  /** Grava um patch no item, atravessando cliente → plano → item. */
  function patchNegocio(n: Negocio, patch: Record<string, unknown>) {
    setData((d) => ({
      ...d,
      areas: (d.areas || []).map((a: Area) =>
        a.id !== "comercial"
          ? a
          : {
              ...a,
              clientes: (a.clientes || []).map((c: Cliente) =>
                c.id !== n.clienteId
                  ? c
                  : {
                      ...c,
                      planos: (c.planos || []).map((pl: Plano) =>
                        pl.id !== n.planoId
                          ? pl
                          : {
                              ...pl,
                              items: (pl.items || []).map((it: Item) =>
                                it.id !== n.itemId ? it : { ...it, ...patch },
                              ),
                            },
                      ),
                    },
              ),
            },
      ),
    }));
  }

  function salvarNovo() {
    if (!novo.clienteId || !novo.nome.trim()) return;
    setData((d) =>
      criarNegocio(d, {
        clienteId: novo.clienteId,
        nome: novo.nome,
        etapa: novo.etapa,
        valor: lerValor(novo.valor),
        temperatura: novo.temperatura,
        origem: novo.origem,
      }),
    );
    setNovo({
      clienteId: novo.clienteId,
      nome: "",
      etapa: PRIMEIRA_ETAPA,
      valor: "",
      temperatura: TEMPERATURA_PADRAO,
      origem: "",
    });
    setCriando(false);
  }

  function moverPara(n: Negocio, etapaId: string) {
    if (n.etapa === etapaId && !n.perdido) return;
    patchNegocio(n, mudarEtapa(n.item, etapaId));
  }

  const temNegocios = negocios.length > 0;

  return (
    <div style={{ fontFamily: "Outfit, sans-serif" }}>
      {/* Criar negócio. Estava faltando: só dava para criar indo em Empresas →
          cliente → plano → Adicionar item, o que ninguém adivinha estando aqui. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button
          onClick={() => {
            setCriando((v) => !v);
            if (!novo.clienteId && empresas[0])
              setNovo((n) => ({ ...n, clienteId: empresas[0].id }));
          }}
          disabled={!empresas.length}
          title={
            empresas.length
              ? "Adicionar um negócio ao funil"
              : "Cadastre uma empresa na aba Empresas primeiro"
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: empresas.length ? "#EC4899" : "#E2E8F0",
            border: "none",
            borderRadius: 9,
            padding: "8px 14px",
            color: "#fff",
            fontSize: 12,
            fontWeight: 800,
            cursor: empresas.length ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          <Plus size={14} /> Novo negócio
        </button>
        {!empresas.length && (
          <span style={{ fontSize: 11, color: "#94A3B8" }}>
            Cadastre uma empresa na aba Empresas para começar.
          </span>
        )}
      </div>

      {criando && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #FBCFE8",
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <Campo rotulo="Empresa">
            <select
              value={novo.clienteId}
              onChange={(e) => setNovo((n) => ({ ...n, clienteId: e.target.value }))}
              style={{ ...campoBase, width: 190 }}
            >
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="O que é o negócio">
            <input
              value={novo.nome}
              onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && salvarNovo()}
              placeholder="Ex.: Adequação à LGPD"
              style={{ ...campoBase, width: 230 }}
            />
          </Campo>
          <Campo rotulo="Etapa">
            <select
              value={novo.etapa}
              onChange={(e) => setNovo((n) => ({ ...n, etapa: e.target.value }))}
              style={{ ...campoBase, width: 150 }}
            >
              {ETAPAS.map((et) => (
                <option key={et.id} value={et.id}>
                  {et.nome}
                </option>
              ))}
            </select>
          </Campo>
          {verValores && (
            <Campo rotulo="Valor">
              <input
                value={novo.valor}
                onChange={(e) => setNovo((n) => ({ ...n, valor: e.target.value }))}
                placeholder="45000 ou 45k"
                style={{ ...campoBase, width: 120 }}
              />
            </Campo>
          )}
          <Campo rotulo="Temperatura">
            <select
              value={novo.temperatura}
              onChange={(e) => setNovo((n) => ({ ...n, temperatura: e.target.value }))}
              style={{ ...campoBase, width: 110 }}
            >
              {TEMPERATURAS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Origem">
            <select
              value={novo.origem}
              onChange={(e) => setNovo((n) => ({ ...n, origem: e.target.value }))}
              style={{ ...campoBase, width: 150 }}
            >
              <option value="">Não informada</option>
              {ORIGENS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Campo>
          <button
            onClick={salvarNovo}
            disabled={!novo.nome.trim()}
            style={{
              background: novo.nome.trim() ? "#0F172A" : "#E2E8F0",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              cursor: novo.nome.trim() ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >
            Adicionar
          </button>
          <button
            onClick={() => setCriando(false)}
            style={{
              background: "none",
              border: "none",
              color: "#94A3B8",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              padding: "8px 6px",
            }}
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Números do topo */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Numero
          rotulo="Em aberto"
          valor={String(resumo.emAberto)}
          detalhe={verValores ? formatarValorCurto(resumo.valorEmAberto) : "-"}
          cor="#3B82F6"
        />
        <Numero
          rotulo="Ganhos"
          valor={String(resumo.ganhos)}
          detalhe={verValores ? formatarValorCurto(resumo.valorGanho) : "-"}
          cor="#10B981"
        />
        <Numero
          rotulo="Perdidos"
          valor={String(resumo.perdidos)}
          detalhe={verValores ? formatarValorCurto(resumo.valorPerdido) : "-"}
          cor="#EF4444"
        />
        <Numero
          rotulo="Taxa de ganho"
          valor={resumo.taxaGanho === null ? "-" : `${resumo.taxaGanho}%`}
          detalhe={
            resumo.taxaGanho === null
              ? "nada decidido ainda"
              : `${resumo.ganhos} de ${resumo.ganhos + resumo.perdidos}`
          }
          cor="#8B5CF6"
        />
        {verValores && (
          <Numero
            rotulo="Ticket médio"
            valor={resumo.ticketMedio ? formatarValorCurto(resumo.ticketMedio) : "-"}
            detalhe="por negócio ganho"
            cor="#F59E0B"
          />
        )}
      </div>

      {!verValores && (
        <p style={{ fontSize: 11, color: "#94A3B8", marginBottom: 14 }}>
          Os valores em R$ estão ocultos para o seu perfil.
        </p>
      )}

      {parados.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 16,
          }}
        >
          <Clock size={15} color="#B45309" />
          <span style={{ fontSize: 12, color: "#92400E" }}>
            <strong>{parados.length}</strong> negócio{parados.length !== 1 ? "s" : ""} sem movimento
            há mais de {DIAS_PARADO_ALERTA} dias
            {parados[0]
              ? ` - o mais antigo é ${parados[0].clienteNome} (${parados[0].diasParado} dias)`
              : ""}
          </span>
        </div>
      )}

      {semProximoPasso.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "#F0F9FF",
            border: "1px solid #BAE6FD",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 16,
          }}
        >
          <CalendarClock size={15} color="#0369A1" />
          <span style={{ fontSize: 12, color: "#075985" }}>
            <strong>{semProximoPasso.length}</strong> negócio
            {semProximoPasso.length !== 1 ? "s" : ""} em aberto sem próximo passo marcado - abra o
            card e registre um follow-up com data para não deixar cair.
          </span>
        </div>
      )}

      {/* As colunas */}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", alignItems: "flex-start" }}>
        {funil.map((col) => {
          const alvo = colunaAlvo === col.etapa.id;
          return (
            <div
              key={col.etapa.id}
              onDragOver={(e) => {
                e.preventDefault();
                setColunaAlvo(col.etapa.id);
              }}
              onDragLeave={() => setColunaAlvo(null)}
              onDrop={() => {
                if (arrastando) moverPara(arrastando, col.etapa.id);
                setArrastando(null);
                setColunaAlvo(null);
              }}
              style={{
                flex: "0 0 250px",
                background: alvo ? "#F0FDFA" : "#fff",
                border: `1px solid ${alvo ? col.etapa.cor : "#E2E8F0"}`,
                borderRadius: 12,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                transition: "background .15s, border-color .15s",
              }}
            >
              <div style={{ borderBottom: `2px solid ${col.etapa.cor}`, paddingBottom: 8 }}>
                <div
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                >
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>
                    {col.etapa.nome}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#64748B",
                      background: "#F1F5F9",
                      borderRadius: 10,
                      padding: "1px 8px",
                    }}
                  >
                    {col.quantidade}
                  </span>
                </div>
                {verValores && (
                  <div
                    style={{ fontSize: 11, fontWeight: 700, color: col.etapa.cor, marginTop: 3 }}
                  >
                    {formatarValorCurto(col.total)}
                  </div>
                )}
              </div>

              {col.negocios.length === 0 && (
                <p
                  style={{
                    fontSize: 11,
                    color: "#CBD5E1",
                    fontStyle: "italic",
                    padding: "8px 2px",
                  }}
                >
                  Nenhum negócio aqui
                </p>
              )}

              {col.negocios.map((n) => (
                <CardNegocio
                  key={n.itemId}
                  negocio={n}
                  profiles={profiles}
                  verValores={verValores}
                  onDragStart={() => setArrastando(n)}
                  onDragEnd={() => setArrastando(null)}
                  onClick={() => setAberto(n)}
                />
              ))}
            </div>
          );
        })}
      </div>

      {!temNegocios && (
        <div
          style={{
            marginTop: 18,
            padding: 20,
            background: "#F8FAFC",
            border: "1px dashed #CBD5E1",
            borderRadius: 12,
            fontSize: 12,
            color: "#64748B",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "#0F172A" }}>O funil está vazio.</strong> Cada negócio é um item
          dentro de um cliente do Comercial - crie o cliente e adicione a proposta como item. Etapa,
          valor e temperatura ficam no card, na aba Comercial.
        </div>
      )}

      {/* Painéis de leitura */}
      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {(
            [
              ["conversao", "Conversão por etapa"],
              ["origem", "Origem dos negócios"],
              ["perdidos", `Perdidos (${perdidos.length})`],
            ] as const
          ).map(([id, rotulo]) => (
            <button
              key={id}
              onClick={() => setPainel(id)}
              style={{
                background: painel === id ? "#0F172A" : "#fff",
                color: painel === id ? "#fff" : "#64748B",
                border: "1px solid #E2E8F0",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <div style={caixa}>
          {painel === "conversao" && (
            <>
              <p style={{ fontSize: 11, color: "#94A3B8", marginBottom: 12 }}>
                Quantos negócios passaram por cada etapa e quantos chegaram à seguinte. Conta a
                partir do momento em que o funil entrou no ar, então enche com o uso.
              </p>
              {conversao.map((c) => (
                <div
                  key={c.etapa.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 0",
                    borderBottom: "1px solid #F1F5F9",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", width: 110 }}>
                    {c.etapa.nome}
                  </span>
                  <div style={{ flex: 1, height: 6, background: "#F1F5F9", borderRadius: 3 }}>
                    <div
                      style={{
                        width: `${c.taxa ?? 0}%`,
                        height: "100%",
                        background: c.etapa.cor,
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 11, color: "#64748B", width: 130, textAlign: "right" }}>
                    {c.passaram} passaram
                    {c.taxa !== null ? ` · ${c.taxa}% avançou` : ""}
                  </span>
                </div>
              ))}
            </>
          )}

          {painel === "origem" && (
            <>
              {origens.length === 0 && <Vazio texto="Nenhum negócio cadastrado ainda." />}
              {origens.map((o) => (
                <div
                  key={o.origem}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid #F1F5F9",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>
                    {o.origem}
                  </span>
                  <span style={{ fontSize: 11, color: "#64748B" }}>
                    {o.total} negócio{o.total !== 1 ? "s" : ""} · {o.ganhos} ganho
                    {o.ganhos !== 1 ? "s" : ""}
                    {verValores && o.valor ? ` · ${formatarValorCurto(o.valor)}` : ""}
                  </span>
                </div>
              ))}
            </>
          )}

          {painel === "perdidos" && (
            <>
              {perdidos.length === 0 && <Vazio texto="Nenhum negócio perdido registrado." />}
              {perdidos.map((n) => (
                <div
                  key={n.itemId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom: "1px solid #F1F5F9",
                  }}
                >
                  <XCircle size={13} color="#EF4444" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>
                      {n.clienteNome} - {n.nome}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748B" }}>
                      {String(n.item.motivoPerda || "sem motivo registrado")}
                    </div>
                  </div>
                  <button
                    onClick={() => patchNegocio(n, reabrirNegocio(n.item))}
                    title="Reabrir negócio"
                    style={botaoMini}
                  >
                    <RotateCcw size={11} /> Reabrir
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {aberto && (
        <ItemModal
          areaId="comercial"
          clienteId={aberto.clienteId}
          planoId={aberto.planoId}
          itemId={aberto.itemId}
          onClose={() => setAberto(null)}
        />
      )}
    </div>
  );
}

function CardNegocio({
  negocio,
  profiles,
  verValores,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  negocio: Negocio;
  profiles: Profile[];
  verValores: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  // Soltar o card não pode contar como clique e abrir o modal.
  const arrastou = useRef(false);
  const resps = negocio.responsaveis
    .map((id) => profiles.find((p) => p.id === id))
    .filter(Boolean) as Profile[];
  const parado = (negocio.diasParado ?? 0) >= DIAS_PARADO_ALERTA;
  const passo = proximoPasso(negocio.item);

  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      aria-label={`Abrir negócio: ${negocio.nome} - ${negocio.clienteNome}`}
      onDragStart={() => {
        arrastou.current = true;
        onDragStart();
      }}
      onDragEnd={() => {
        onDragEnd();
        setTimeout(() => {
          arrastou.current = false;
        }, 0);
      }}
      onClick={() => {
        if (!arrastou.current) onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        background: "#fff",
        border: "1px solid #E2E8F0",
        borderLeft: `3px solid ${corDaTemperatura(negocio.temperatura)}`,
        borderRadius: 10,
        padding: 10,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>{negocio.clienteNome}</div>
      <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.4 }}>{negocio.nome}</div>

      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}
      >
        {verValores && negocio.valor > 0 && (
          <span style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>
            {formatarValor(negocio.valor)}
          </span>
        )}
        {passo && (
          <span
            title={`Próximo passo: ${passo.texto}${passo.quando ? ` (${passo.quando})` : ""}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              fontSize: 9,
              fontWeight: 700,
              color: passo.atrasado ? "#DC2626" : "#0D9488",
            }}
          >
            <CalendarClock size={10} />
            {passo.quando || "sem data"}
          </span>
        )}
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: parado ? "#B45309" : "#94A3B8",
            marginLeft: "auto",
          }}
        >
          {negocio.diasParado === null
            ? ""
            : negocio.diasParado === 0
              ? "hoje"
              : `${negocio.diasParado}d parado`}
        </span>
      </div>

      {(resps.length > 0 || negocio.origem) && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {resps.map((p) => (
            <span
              key={p.id}
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
          ))}
          {negocio.origem && (
            <span style={{ fontSize: 9, color: "#94A3B8", marginLeft: "auto" }}>
              {negocio.origem}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  detalhe,
  cor,
}: {
  rotulo: string;
  valor: string;
  detalhe: string;
  cor: string;
}) {
  return (
    <div
      style={{
        flex: "1 1 150px",
        background: "#fff",
        border: "1px solid #E2E8F0",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase" }}>
        {rotulo}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: cor, marginTop: 4 }}>{valor}</div>
      <div style={{ fontSize: 11, color: "#64748B" }}>{detalhe}</div>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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

const campoBase: CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  color: "#0F172A",
  fontFamily: "inherit",
  outline: "none",
};

function Vazio({ texto }: { texto: string }) {
  return <p style={{ fontSize: 12, color: "#CBD5E1", fontStyle: "italic" }}>{texto}</p>;
}

const caixa: CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 12,
  padding: 16,
};

const botaoMini: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 7,
  padding: "4px 9px",
  fontSize: 10,
  fontWeight: 700,
  color: "#475569",
  cursor: "pointer",
  fontFamily: "inherit",
};
