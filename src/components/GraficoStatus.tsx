// O gráfico de barras do Painel, num arquivo só dele.
//
// Existe separado por causa do peso: o recharts é a maior biblioteca do
// projeto e era carregada junto do pacote principal, isto é, em toda tela —
// no Quadro Geral, na tela "Eu", no diretório de clientes — mesmo que só o
// Painel desenhe um gráfico. Aqui ele só é buscado quando o Painel aparece.

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export type FatiaDoGrafico = { name: string; v: number; color: string };

export default function GraficoStatus({ dados }: { dados: FatiaDoGrafico[] }) {
  return (
    <ResponsiveContainer width="100%" height={170}>
      <BarChart data={dados} barSize={22} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
        <XAxis
          dataKey="name"
          tick={{ fill: "#94A3B8", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            background: "#F8FAFC",
            border: "1px solid #2a3550",
            borderRadius: 8,
            color: "#0F172A",
            fontSize: 11,
          }}
          cursor={{ fill: "#ffffff06" }}
        />
        <Bar dataKey="v" radius={[5, 5, 0, 0]}>
          {dados.map((e, i) => (
            <Cell key={i} fill={e.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
