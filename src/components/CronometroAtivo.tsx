// A pílula do cronômetro: aparece em qualquer tela enquanto houver tempo
// correndo, com o relógio, a demanda e o botão de parar.
//
// Cronômetro esquecido é o erro clássico de folha de horas. Ver o relógio
// andando no canto da tela, em vez de só dentro do card, é o que evita fechar
// o mês com uma demanda de 40 horas que levou duas.

import { Square, Clock } from "lucide-react";
import { useState } from "react";
import { pararCronometro, useAgora, useCronometro } from "@/lib/apontamentos";
import { ALERTA_SEG, duracaoSeg, formatarRelogio, type Apontamento } from "@/lib/tempo";

export default function CronometroAtivo({
  userId,
  abrirCard,
}: {
  userId: string;
  abrirCard: (a: Apontamento) => void;
}) {
  const { ativo } = useCronometro(userId);
  const agora = useAgora(!!ativo);
  const [erro, setErro] = useState("");
  if (!ativo) return null;

  const seg = duracaoSeg(ativo, agora);
  const esquecido = seg > ALERTA_SEG;

  async function parar() {
    setErro("");
    if (esquecido) {
      // Mais de 10 horas: abre o card, onde dá para dizer a hora certa do fim.
      abrirCard(ativo!);
      return;
    }
    const r = await pararCronometro();
    if (!r.ok) setErro(r.erro);
  }

  return (
    <div
      style={{
        position: "fixed",
        left: 16,
        bottom: 16,
        zIndex: 800,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: esquecido ? "#FFFBEB" : "#0F172A",
        color: esquecido ? "#92400E" : "#fff",
        border: esquecido ? "1px solid #FCD34D" : "none",
        borderRadius: 999,
        padding: "7px 8px 7px 14px",
        boxShadow: "0 10px 30px rgba(15,23,42,0.25)",
        fontFamily: "Outfit, sans-serif",
        fontSize: 12,
        maxWidth: "min(460px, calc(100vw - 32px))",
      }}
    >
      <Clock size={14} />
      <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatarRelogio(seg)}</strong>
      <button
        onClick={() => abrirCard(ativo)}
        title="Abrir a demanda"
        style={{
          background: "none",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 12,
          padding: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          textAlign: "left",
          minWidth: 0,
        }}
      >
        {ativo.item_nome}
        {ativo.subitem_nome ? ` › ${ativo.subitem_nome}` : ""}
        <span style={{ opacity: 0.6 }}> · {ativo.cliente_nome}</span>
      </button>
      {erro && <span style={{ color: "#F87171" }}>{erro}</span>}
      <button
        onClick={() => void parar()}
        title={esquecido ? "Ligado há mais de 10h: abrir para corrigir o fim" : "Parar e gravar"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          background: "#DC2626",
          color: "#fff",
          border: "none",
          borderRadius: 999,
          padding: "5px 11px",
          fontWeight: 700,
          fontSize: 12,
          cursor: "pointer",
          fontFamily: "inherit",
          flexShrink: 0,
        }}
      >
        <Square size={10} fill="#fff" /> {esquecido ? "Corrigir" : "Parar"}
      </button>
    </div>
  );
}
