// Aviso de alteração que o banco recusou.
//
// Quando o banco recusa uma gravação de vez (sem permissão, dado inválido), a
// loja descarta o lote e a tela volta ao que está salvo. Sem este aviso a
// pessoa veria a edição sumir sem entender por quê.

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

function traduzir(erro: string) {
  if (/permiss|42501|row-level/i.test(erro))
    return "você não tem permissão para alterar esta área.";
  return "o sistema recusou a alteração.";
}

export default function AvisoGravacao() {
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ouvir = (e: Event) => {
      setErro(String((e as CustomEvent).detail || ""));
      clearTimeout(timer);
      timer = setTimeout(() => setErro(null), 10_000);
    };
    window.addEventListener("adeke:gravacao-recusada", ouvir);
    return () => {
      window.removeEventListener("adeke:gravacao-recusada", ouvir);
      clearTimeout(timer);
    };
  }, []);

  if (erro === null) return null;
  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 950,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#FEF2F2",
        border: "1px solid #FECACA",
        color: "#991B1B",
        borderRadius: 8,
        padding: "10px 12px 10px 14px",
        fontSize: 13,
        fontFamily: "Outfit, sans-serif",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <AlertTriangle size={15} />
      <span>Uma alteração não foi salva: {traduzir(erro)} A tela voltou ao que está gravado.</span>
      <button
        onClick={() => setErro(null)}
        title="Fechar"
        style={{ background: "none", border: "none", cursor: "pointer", lineHeight: 0, padding: 2 }}
      >
        <X size={14} color="#991B1B" />
      </button>
    </div>
  );
}
