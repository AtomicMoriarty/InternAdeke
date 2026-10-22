// O gráfico de barras do Painel: quantos cards em cada status.
//
// Era desenhado com o recharts, a maior biblioteca do projeto (366KB, mais que
// o resto do Painel inteiro), e como o Painel é a tela de abertura ela era
// baixada em toda entrada no sistema — para sete barras. Sete barras são
// sete divs: o número em cima, a barra proporcional e o nome embaixo.

export type FatiaDoGrafico = { name: string; v: number; color: string };

const ALTURA = 120;

export default function GraficoStatus({ dados }: { dados: FatiaDoGrafico[] }) {
  const maior = Math.max(1, ...dados.map((d) => d.v));
  return (
    <div
      role="img"
      aria-label={dados.map((d) => `${d.name}: ${d.v}`).join(", ")}
      style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 170 }}
    >
      {dados.map((d) => (
        <div
          key={d.name}
          title={`${d.name}: ${d.v}`}
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: "#334155" }}>{d.v}</span>
          <div
            style={{
              width: "100%",
              maxWidth: 28,
              height: Math.max(d.v ? 3 : 0, Math.round((d.v / maior) * ALTURA)),
              background: d.color,
              borderRadius: "4px 4px 0 0",
            }}
          />
          <span
            style={{
              fontSize: 10,
              color: "#94A3B8",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {d.name}
          </span>
        </div>
      ))}
    </div>
  );
}
