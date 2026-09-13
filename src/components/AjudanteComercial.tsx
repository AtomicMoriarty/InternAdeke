// Ajudante Comercial: conte o caso, saia com a mensagem pronta.
//
// A tela é um formulário curto e três variações à direita. O que ela evita é a
// página em branco: ninguém trava escolhendo palavra, só revisa e envia.

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Copy, Check, Sparkles, AlertTriangle } from "lucide-react";
import {
  SITUACOES,
  CANAIS,
  AREAS_AJUDANTE,
  TRATAMENTOS,
  situacaoPorId,
  areaPorId,
  gerarFollowups,
  casoVazio,
  excedeCanal,
  type Caso,
  type Canal,
} from "@/lib/ajudanteComercial";
import { useProfiles } from "@/lib/profiles";
import { useCurrentUser } from "@/lib/useCurrentUser";

export default function AjudanteComercial() {
  const profiles = useProfiles();
  const me = useCurrentUser();
  const meuNome = me ? profiles.find((p) => p.id === me.id)?.display_name || "" : "";

  const [caso, setCaso] = useState<Caso>(() => ({ ...casoVazio(), remetente: meuNome }));
  const [copiado, setCopiado] = useState<string | null>(null);

  // Quem abriu a tela assina por padrão, mas pode trocar: às vezes se escreve
  // em nome de outra pessoa do escritório.
  const remetente = caso.remetente || meuNome;
  const resultado = useMemo(() => gerarFollowups({ ...caso, remetente }), [caso, remetente]);

  const situacao = situacaoPorId(caso.situacao);
  const area = areaPorId(caso.area);
  const set = (patch: Partial<Caso>) => setCaso((c) => ({ ...c, ...patch }));

  async function copiar(id: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 1800);
    } catch {
      // Sem permissão de área de transferência: a pessoa seleciona à mão.
      setCopiado(null);
    }
  }

  return (
    <div style={{ fontFamily: "Outfit, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ background: "#EC489918", borderRadius: 10, padding: 10 }}>
          <Sparkles size={20} color="#EC4899" />
        </div>
        <div>
          <h2 style={{ color: "#0F172A", fontSize: 20, fontWeight: 900 }}>Ajudante Comercial</h2>
          <p style={{ color: "#64748B", fontSize: 12 }}>
            Conte o caso e saia com a mensagem pronta para revisar e enviar.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* ── O caso ── */}
        <div style={{ ...caixa, flex: "1 1 340px", maxWidth: 460 }}>
          <Rotulo>O que está acontecendo</Rotulo>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}
          >
            {SITUACOES.map((s) => {
              const ativa = caso.situacao === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => set({ situacao: s.id })}
                  title={s.descricao}
                  style={{
                    background: ativa ? "#EC489912" : "#fff",
                    border: `1px solid ${ativa ? "#EC4899" : "#E2E8F0"}`,
                    color: ativa ? "#BE185D" : "#64748B",
                    borderRadius: 9,
                    padding: "8px 10px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                    lineHeight: 1.3,
                  }}
                >
                  {s.nome}
                </button>
              );
            })}
          </div>
          {situacao && (
            <p style={{ fontSize: 11, color: "#94A3B8", marginBottom: 14, fontStyle: "italic" }}>
              {situacao.descricao}
            </p>
          )}

          <Rotulo>Área</Rotulo>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 }}>
            {AREAS_AJUDANTE.map((a) => {
              const ativa = caso.area === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => set({ area: a.id })}
                  style={{
                    background: ativa ? "#0F172A" : "#fff",
                    border: `1px solid ${ativa ? "#0F172A" : "#E2E8F0"}`,
                    color: ativa ? "#fff" : "#64748B",
                    borderRadius: 20,
                    padding: "5px 11px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {a.nome}
                </button>
              );
            })}
          </div>

          <Rotulo>Quem recebe</Rotulo>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <select
              value={caso.tratamento}
              onChange={(e) => set({ tratamento: e.target.value })}
              style={{ ...campo, width: 130 }}
            >
              {TRATAMENTOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              value={caso.contato}
              onChange={(e) => set({ contato: e.target.value })}
              placeholder="Nome do contato"
              style={{ ...campo, flex: 1 }}
            />
          </div>
          <input
            value={caso.empresa}
            onChange={(e) => set({ empresa: e.target.value })}
            placeholder="Empresa"
            style={{ ...campo, width: "100%", marginBottom: 14 }}
          />

          <Rotulo>Sobre o que é</Rotulo>
          <textarea
            value={caso.assunto}
            onChange={(e) => set({ assunto: e.target.value })}
            placeholder="Ex.: a adequação à LGPD que conversamos na reunião de setembro"
            rows={2}
            style={{ ...campo, width: "100%", resize: "vertical", lineHeight: 1.5 }}
          />
          {area && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "7px 0 14px" }}>
              {area.ganchos.map((g) => (
                <button
                  key={g}
                  onClick={() => set({ assunto: g })}
                  title="Usar como assunto"
                  style={{
                    background: "#F8FAFC",
                    border: "1px solid #E2E8F0",
                    borderRadius: 20,
                    padding: "3px 9px",
                    fontSize: 10,
                    color: "#64748B",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          )}

          {situacao?.usaDias && (
            <>
              <Rotulo>Há quantos dias sem resposta</Rotulo>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <input
                  type="number"
                  min={0}
                  value={caso.diasSemResposta}
                  onChange={(e) =>
                    set({ diasSemResposta: Math.max(0, Number(e.target.value) || 0) })
                  }
                  style={{ ...campo, width: 80 }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#0F172A",
                    background: "#F1F5F9",
                    borderRadius: 20,
                    padding: "4px 10px",
                  }}
                >
                  tom: {resultado.tom.nome}
                </span>
                <span style={{ fontSize: 10, color: "#94A3B8" }}>{resultado.tom.explicacao}</span>
              </div>
            </>
          )}

          {situacao?.pedeReuniao && (
            <>
              <Rotulo>Quando era a reunião</Rotulo>
              <input
                value={caso.reuniao}
                onChange={(e) => set({ reuniao: e.target.value })}
                placeholder="Ex.: quinta, 14h"
                style={{ ...campo, width: "100%", marginBottom: 14 }}
              />
            </>
          )}

          <Rotulo>Prazo, se houver</Rotulo>
          <input
            value={caso.prazo}
            onChange={(e) => set({ prazo: e.target.value })}
            placeholder="Ex.: até 20/10 - escreva do jeito que vai aparecer na mensagem"
            style={{ ...campo, width: "100%", marginBottom: 14 }}
          />

          <Rotulo>Canal</Rotulo>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 }}>
            {CANAIS.map((c) => {
              const ativa = caso.canal === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => set({ canal: c.id as Canal })}
                  style={{
                    background: ativa ? "#0DD3C5" : "#fff",
                    border: `1px solid ${ativa ? "#0DD3C5" : "#E2E8F0"}`,
                    color: ativa ? "#fff" : "#64748B",
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {c.nome}
                </button>
              );
            })}
          </div>

          <Rotulo>Quem assina</Rotulo>
          <input
            value={remetente}
            onChange={(e) => set({ remetente: e.target.value })}
            placeholder="Seu nome"
            style={{ ...campo, width: "100%" }}
          />
        </div>

        {/* ── As mensagens ── */}
        <div style={{ flex: "2 1 420px", display: "flex", flexDirection: "column", gap: 12 }}>
          {resultado.observacoes.length > 0 && (
            <div
              style={{
                background: "#FFFBEB",
                border: "1px solid #FDE68A",
                borderRadius: 10,
                padding: "10px 13px",
              }}
            >
              {resultado.observacoes.map((o) => (
                <div
                  key={o}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    fontSize: 11,
                    color: "#92400E",
                    marginBottom: 3,
                  }}
                >
                  <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{o}</span>
                </div>
              ))}
            </div>
          )}

          {resultado.mensagens.map((m) => {
            const passou = excedeCanal(m, caso.canal);
            const paraCopiar = m.assuntoEmail
              ? `Assunto: ${m.assuntoEmail}\n\n${m.corpo}`
              : m.corpo;
            return (
              <div key={m.id} style={caixa}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 9,
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                      color: "#EC4899",
                    }}
                  >
                    {m.postura}
                  </span>
                  <button onClick={() => copiar(m.id, paraCopiar)} style={botaoCopiar}>
                    {copiado === m.id ? <Check size={12} /> : <Copy size={12} />}
                    {copiado === m.id ? "Copiado" : "Copiar"}
                  </button>
                </div>

                {m.assuntoEmail && (
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#0F172A",
                      background: "#F8FAFC",
                      borderRadius: 7,
                      padding: "6px 9px",
                      marginBottom: 8,
                    }}
                  >
                    Assunto: {m.assuntoEmail}
                  </div>
                )}

                <div
                  style={{
                    fontSize: 12.5,
                    color: "#1E293B",
                    lineHeight: 1.65,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.corpo}
                </div>

                {passou && (
                  <p style={{ fontSize: 10, color: "#B45309", marginTop: 8 }}>
                    Longa para {CANAIS.find((c) => c.id === caso.canal)?.nome} - considere cortar.
                  </p>
                )}
              </div>
            );
          })}

          <div
            style={{
              background: "#F0FDFA",
              border: "1px solid #99F6E4",
              borderRadius: 10,
              padding: "10px 13px",
              fontSize: 11,
              color: "#0F766E",
            }}
          >
            <strong>Depois de enviar:</strong> {resultado.sugestaoProximoPasso} Registre como
            follow-up no card do negócio, com a data - assim ele cobra você de volta.
          </div>
        </div>
      </div>
    </div>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 800,
        color: "#94A3B8",
        textTransform: "uppercase",
        letterSpacing: 0.7,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

const caixa: CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 12,
  padding: 16,
};

const campo: CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: "8px 11px",
  fontSize: 12,
  color: "#0F172A",
  fontFamily: "inherit",
  outline: "none",
};

const botaoCopiar: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 7,
  padding: "5px 10px",
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
  cursor: "pointer",
  fontFamily: "inherit",
};
