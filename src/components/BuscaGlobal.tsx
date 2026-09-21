// Achar qualquer coisa de qualquer tela, sem navegar pasta por pasta.
//
// São 487 cards em 71 clientes espalhados por seis áreas. Achar "aquele
// aditivo da INCRÍVEL" custava entrar na área, achar o cliente no grid, abrir
// a pasta e varrer a lista — e isso quando a pessoa lembrava em que área a
// demanda estava. Com Ctrl+K, digita e vai.
//
// A paleta é montada em todas as telas, mas só encosta nos dados quando é
// aberta: o estado é um JSON de quase meio mega, e carregá-lo para um atalho
// que ninguém apertou seria pagar caro por nada. Por isso são dois
// componentes — o de fora só escuta a tecla.

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Search, CornerDownLeft, X } from "lucide-react";
import { useDashboardState } from "@/lib/useDashboardState";
import { flattenDashboard, type FlatCard } from "@/lib/flattenItems";
import { clientesAtivos } from "@/lib/diretorioClientes";
import { procurar, type Destino } from "@/lib/busca";

export type { Destino };

// ─── O que fica montado em toda tela ────────────────────────────────────────

export default function BuscaGlobal({ aoEscolher }: { aoEscolher: (d: Destino) => void }) {
  const [aberta, setAberta] = useState(false);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberta((v) => !v);
      }
      if (e.key === "Escape") setAberta(false);
    };
    window.addEventListener("keydown", tecla);
    // Quem não conhece o atalho chega por aqui: outras telas disparam este
    // evento a partir de um botão visível.
    const pedido = () => setAberta(true);
    window.addEventListener("adeke:busca", pedido);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("adeke:busca", pedido);
    };
  }, []);

  // Só aqui o estado é tocado: enquanto a paleta estiver fechada, nada é
  // carregado por causa dela.
  if (!aberta) return null;
  return <Paleta fechar={() => setAberta(false)} aoEscolher={aoEscolher} />;
}

function Paleta({ fechar, aoEscolher }: { fechar: () => void; aoEscolher: (d: Destino) => void }) {
  const { data, loaded } = useDashboardState("busca");
  const [termo, setTermo] = useState("");
  const [cursor, setCursor] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campo.current?.focus();
  }, []);

  const cards = useMemo(() => (data ? flattenDashboard(data) : []), [data]);
  const clientes = useMemo(() => (data ? clientesAtivos(data) : []), [data]);
  const achados = useMemo(() => procurar(termo, cards, clientes), [termo, cards, clientes]);

  useEffect(() => {
    setCursor(0);
  }, [termo]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, achados.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      }
      if (e.key === "Enter" && achados[cursor]) {
        e.preventDefault();
        aoEscolher(achados[cursor].destino);
        fechar();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [achados, cursor, aoEscolher, fechar]);

  let grupoAnterior = "";

  return (
    <div
      onClick={fechar}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 900,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "10vh",
        fontFamily: "Outfit, sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 14,
          width: "min(620px, calc(100vw - 32px))",
          maxHeight: "72vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 70px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "13px 15px",
            borderBottom: "1px solid #F1F5F9",
          }}
        >
          <Search size={16} color="#94A3B8" />
          <input
            ref={campo}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar card, cliente ou tela..."
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: 14,
              fontFamily: "inherit",
              color: "#0F172A",
            }}
          />
          <button
            onClick={fechar}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 2,
              lineHeight: 0,
            }}
          >
            <X size={15} color="#94A3B8" />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: 6 }}>
          {!loaded && <p style={{ padding: 18, fontSize: 12, color: "#94A3B8" }}>Carregando...</p>}
          {loaded && !termo && (
            <p style={{ padding: 18, fontSize: 12, color: "#94A3B8", lineHeight: 1.7 }}>
              Digite para procurar entre {cards.length} cards e {clientes.length} clientes.
              <br />
              As palavras podem vir fora de ordem: &quot;incrivel aditivo&quot; acha
              &quot;Elaboração 10º Aditivo FM&quot; da INCRÍVEL.
            </p>
          )}
          {loaded && termo && !achados.length && (
            <p style={{ padding: 18, fontSize: 12, color: "#94A3B8" }}>
              Nada encontrado para &quot;{termo}&quot;.
            </p>
          )}
          {achados.map((r, i) => {
            const cabecalho = r.grupo !== grupoAnterior ? r.grupo : "";
            grupoAnterior = r.grupo;
            return (
              <div key={r.chave}>
                {cabecalho && (
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#94A3B8",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      padding: "10px 10px 4px",
                    }}
                  >
                    {cabecalho}
                  </p>
                )}
                <button
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => {
                    aoEscolher(r.destino);
                    fechar();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    textAlign: "left",
                    background: i === cursor ? "#F0FDFA" : "transparent",
                    border: "none",
                    borderRadius: 9,
                    padding: "8px 10px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <span
                    style={{
                      width: 3,
                      alignSelf: "stretch",
                      borderRadius: 2,
                      background: r.cor,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: "#0F172A",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.titulo}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 10.5,
                        color: "#64748B",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.detalhe}
                    </span>
                  </span>
                  {r.encerrado && (
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        color: "#94A3B8",
                        background: "#F1F5F9",
                        borderRadius: 20,
                        padding: "2px 7px",
                        flexShrink: 0,
                      }}
                    >
                      encerrado
                    </span>
                  )}
                  {i === cursor && <CornerDownLeft size={13} color="#0DD3C5" />}
                </button>
              </div>
            );
          })}
        </div>

        <div style={rodape}>
          <span>↑ ↓ para andar</span>
          <span>Enter para abrir</span>
          <span>Esc para fechar</span>
        </div>
      </div>
    </div>
  );
}

const rodape: CSSProperties = {
  display: "flex",
  gap: 14,
  padding: "8px 15px",
  borderTop: "1px solid #F1F5F9",
  fontSize: 10.5,
  color: "#94A3B8",
  background: "#FAFBFC",
};
