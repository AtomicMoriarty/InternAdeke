// A tela de importar um quadro do Trello.
//
// Ela existe porque importar às cegas dá errado: o Trello não sabe quem é
// cliente, quem é responsável nem em que área a demanda entra. Então a tela
// mostra o que entendeu do arquivo, deixa corrigir, conta quantos cards vão
// entrar em cada coluna e só escreve quando a pessoa confirma.
//
// Nada é gravado antes do botão de importar. Ler o arquivo não mexe no estado.

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Upload, FileJson, Check, X, AlertTriangle, ArrowRight } from "lucide-react";
import {
  lerTrello,
  planoPadrao,
  casarPessoas,
  cartoesSelecionados,
  previa,
  importar,
  nomeDoCartao,
  areaDoCartao,
  NOME_SEM_CLIENTE,
  PLANO_IMPORTADO,
  type LeituraTrello,
  type PlanoImportacao,
  type ResultadoImportacao,
} from "@/lib/importTrello";
import { useProfiles } from "@/lib/profiles";
import { areaById } from "@/lib/areas";
import type { DashboardState } from "@/lib/dashboardTypes";

type Props = {
  data: DashboardState;
  setData: (updater: (d: DashboardState) => DashboardState) => void;
  onFechar: () => void;
};

export default function ImportarTrello({ data, setData, onFechar }: Props) {
  const profiles = useProfiles();
  const [arquivo, setArquivo] = useState("");
  const [leitura, setLeitura] = useState<LeituraTrello | null>(null);
  const [plano, setPlano] = useState<PlanoImportacao | null>(null);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState<ResultadoImportacao | null>(null);

  const p = useMemo(
    () => (leitura && plano ? previa(data, leitura, plano) : null),
    [data, leitura, plano],
  );
  const amostra = useMemo(
    () => (leitura && plano ? cartoesSelecionados(leitura, plano).slice(0, 8) : []),
    [leitura, plano],
  );

  async function receber(f: File | null | undefined) {
    if (!f) return;
    setErro("");
    setFeito(null);
    try {
      const lido = lerTrello(JSON.parse(await f.text()));
      setArquivo(f.name);
      setLeitura(lido);
      // Os pares de pessoa já vêm sugeridos: quase sempre estão certos, e
      // conferir sete nomes é mais rápido do que preencher sete do zero.
      setPlano({ ...planoPadrao(lido), pessoaPorTrelloId: casarPessoas(lido, profiles) });
    } catch (e) {
      setLeitura(null);
      setPlano(null);
      setErro(e instanceof Error ? e.message : "Não consegui ler esse arquivo.");
    }
  }

  function mexer(patch: Partial<PlanoImportacao>) {
    setPlano((atual) => (atual ? { ...atual, ...patch } : atual));
  }

  function alternarCliente(chave: string) {
    if (!plano) return;
    const tem = plano.clientesEscolhidos.includes(chave);
    mexer({
      clientesEscolhidos: tem
        ? plano.clientesEscolhidos.filter((k) => k !== chave)
        : [...plano.clientesEscolhidos, chave],
    });
  }

  function confirmar() {
    if (!leitura || !plano) return;
    // Calcula fora do setData porque a tela precisa dos números para mostrar o
    // que aconteceu, e o updater do React roda depois. É o mesmo estado que a
    // prévia acabou de contar, então o que entra é o que a pessoa viu.
    const resultado = importar(data, leitura, plano);
    setData(() => resultado.data);
    setFeito(resultado);
  }

  return (
    <div style={caixa}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ background: "#0DD3C518", borderRadius: 10, padding: 9 }}>
          <Upload size={18} color="#0DD3C5" />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 15, fontWeight: 900, color: "#0F172A" }}>Importar do Trello</h3>
          <p style={{ fontSize: 11, color: "#64748B" }}>
            Exporte o quadro em JSON (Menu do quadro, Mais, Imprimir e exportar, Exportar como JSON)
            e escolha o arquivo aqui.
          </p>
        </div>
        <button onClick={onFechar} style={botaoMini} title="Fechar">
          <X size={13} /> Fechar
        </button>
      </div>

      <label style={{ ...botaoPrincipal, display: "inline-flex" }}>
        <FileJson size={14} /> {arquivo ? "Trocar arquivo" : "Escolher arquivo JSON"}
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => receber(e.target.files?.[0])}
          style={{ display: "none" }}
        />
      </label>
      {arquivo && <span style={{ fontSize: 11, color: "#64748B", marginLeft: 10 }}>{arquivo}</span>}

      {erro && (
        <p style={{ fontSize: 12, color: "#B91C1C", marginTop: 12 }}>
          <AlertTriangle size={12} style={{ verticalAlign: -2 }} /> {erro}
        </p>
      )}

      {feito && (
        <div style={{ ...aviso, ...avisoBom }}>
          <strong style={{ color: "#166534" }}>Importado.</strong> {feito.itensCriados} cards,{" "}
          {feito.clientesCriados} clientes novos no diretório e {feito.vinculosCriados} quadros de
          cliente.
          {feito.repetidos > 0 &&
            ` ${feito.repetidos} cards já tinham sido importados antes e foram pulados.`}
          <br />
          Tudo caiu no plano &quot;{PLANO_IMPORTADO}&quot; de cada cliente, dentro da área.
        </div>
      )}

      {leitura && plano && p && !feito && (
        <>
          <div style={linhaResumo}>
            <Resumo n={leitura.cartoes.length} rotulo="cards no arquivo" />
            <Resumo n={p.total} rotulo="vão ser importados" destaque />
            <Resumo n={p.clientesNovos} rotulo="clientes novos" />
            <Resumo n={p.clientesExistentes} rotulo="clientes já cadastrados" />
          </div>

          {leitura.listasIgnoradas.length > 0 && (
            <div style={aviso}>
              Estas listas do Trello não correspondem a nenhuma coluna daqui e ficam de fora:{" "}
              <strong>{leitura.listasIgnoradas.join(", ")}</strong>.
            </div>
          )}

          <Secao titulo="O que trazer">
            <Opcao
              marcado={plano.incluirFinalizados}
              onChange={(v) => mexer({ incluirFinalizados: v })}
              rotulo="Trazer também os finalizados"
              ajuda="São a maior parte do quadro e viram histórico. Sem eles, entra só o que ainda está em aberto."
            />
            <Opcao
              marcado={plano.incluirArquivados}
              onChange={(v) => mexer({ incluirArquivados: v })}
              rotulo="Trazer os cards arquivados"
              ajuda="Foram tirados do quadro de propósito. Normalmente não precisam voltar."
            />
            <Opcao
              marcado={plano.incluirSemCliente}
              onChange={(v) => mexer({ incluirSemCliente: v })}
              rotulo={`Trazer os cards sem empresa no título, como "${NOME_SEM_CLIENTE}"`}
              ajuda="Coisas internas do escritório, que não são de cliente nenhum."
            />
          </Secao>

          <Secao titulo="Para qual área">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(
                [
                  ["auto", "Separar pelo texto da demanda"],
                  ["societario", "Tudo em Societário"],
                  ["contratos", "Tudo em Contratos"],
                ] as const
              ).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  onClick={() => mexer({ destino: valor })}
                  style={plano.destino === valor ? botaoEscolhido : botaoMini}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "#64748B", marginTop: 8 }}>
              O quadro misturava as duas coisas. Separando pelo texto:{" "}
              {Object.entries(p.porArea)
                .map(([id, n]) => `${n} em ${areaById(id)?.name || id}`)
                .join(", ") || "nada selecionado"}
              . Dá para arrastar depois, card a card.
            </p>
          </Secao>

          <Secao titulo={`Empresas reconhecidas (${leitura.clientes.length})`}>
            <p style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>
              Vieram do título do card, antes do separador. Corrija o nome antes de importar: é
              assim que ele vai ficar no diretório, e variações do mesmo nome viram um cadastro só.
            </p>
            <ListaClientes
              itens={leitura.clientes}
              plano={plano}
              onAlternar={alternarCliente}
              onRenomear={(chave, nome) =>
                mexer({ nomePorChave: { ...plano.nomePorChave, [chave]: nome } })
              }
            />
          </Secao>

          {leitura.sugestoes.length > 0 && (
            <Secao titulo={`Pode ser empresa (${leitura.sugestoes.length})`}>
              <p style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>
                Apareceram uma vez só, depois de dois-pontos ou traço, então podem ser empresa ou
                podem ser só parte do título. Marque as que forem empresa. As que ficarem
                desmarcadas entram assim mesmo, com o título inteiro, como trabalho interno.
              </p>
              <ListaClientes
                itens={leitura.sugestoes}
                plano={plano}
                onAlternar={alternarCliente}
                onRenomear={(chave, nome) =>
                  mexer({ nomePorChave: { ...plano.nomePorChave, [chave]: nome } })
                }
              />
            </Secao>
          )}

          <Secao titulo="Quem é quem">
            <p style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>
              Sem par, o card entra sem responsável.{" "}
              {p.semResponsavel > 0 && (
                <strong>{p.semResponsavel} dos cards não têm ninguém marcado no Trello.</strong>
              )}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {leitura.pessoas.map((pessoa) => (
                <div
                  key={pessoa.trelloId}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <span style={{ fontSize: 12, color: "#0F172A", minWidth: 200 }}>
                    {pessoa.nome}
                  </span>
                  <ArrowRight size={12} color="#94A3B8" />
                  <select
                    value={plano.pessoaPorTrelloId[pessoa.trelloId] || ""}
                    onChange={(e) =>
                      mexer({
                        pessoaPorTrelloId: {
                          ...plano.pessoaPorTrelloId,
                          [pessoa.trelloId]: e.target.value,
                        },
                      })
                    }
                    style={{ ...campo, minWidth: 200 }}
                  >
                    <option value="">Ninguém</option>
                    {profiles.map((perfil) => (
                      <option key={perfil.id} value={perfil.id}>
                        {perfil.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </Secao>

          <Secao titulo="Em que coluna cada um cai">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(p.porColuna).map(([coluna, n]) => (
                <span key={coluna} style={etiquetaCinza}>
                  {coluna}: <strong>{n}</strong>
                </span>
              ))}
            </div>
          </Secao>

          {amostra.length > 0 && (
            <Secao titulo="Como os primeiros vão ficar">
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {amostra.map((c) => (
                  <div key={c.trelloId} style={{ fontSize: 11, color: "#475569" }}>
                    <span style={etiquetaCinza}>{c.coluna}</span>{" "}
                    <span style={{ color: "#0F172A", fontWeight: 700 }}>
                      {nomeDoCartao(c, plano)}
                    </span>{" "}
                    <span style={{ color: "#94A3B8" }}>
                      em {areaById(areaDoCartao(c, plano))?.name}
                    </span>
                  </div>
                ))}
              </div>
            </Secao>
          )}

          <button onClick={confirmar} disabled={p.total === 0} style={botaoPrincipal}>
            <Check size={14} /> Importar {p.total} cards
          </button>
        </>
      )}
    </div>
  );
}

function ListaClientes({
  itens,
  plano,
  onAlternar,
  onRenomear,
}: {
  itens: { chave: string; nome: string; variantes: string[]; cartoes: number }[];
  plano: PlanoImportacao;
  onAlternar: (chave: string) => void;
  onRenomear: (chave: string, nome: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        maxHeight: 280,
        overflowY: "auto",
      }}
    >
      {itens.map((c) => (
        <div key={c.chave} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={plano.clientesEscolhidos.includes(c.chave)}
            onChange={() => onAlternar(c.chave)}
          />
          <input
            value={plano.nomePorChave[c.chave] ?? c.nome}
            onChange={(e) => onRenomear(c.chave, e.target.value)}
            style={{ ...campo, flex: "1 1 200px", maxWidth: 320 }}
          />
          <span style={{ fontSize: 11, color: "#64748B" }}>{c.cartoes} cards</span>
          {c.variantes.length > 1 && (
            <span style={{ fontSize: 10, color: "#94A3B8" }}>
              escrito também como {c.variantes.slice(1).join(", ")}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <h4 style={{ fontSize: 12, fontWeight: 900, color: "#0F172A", marginBottom: 8 }}>{titulo}</h4>
      {children}
    </div>
  );
}

function Opcao({
  marcado,
  onChange,
  rotulo,
  ajuda,
}: {
  marcado: boolean;
  onChange: (v: boolean) => void;
  rotulo: string;
  ajuda: string;
}) {
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
      <input
        type="checkbox"
        checked={marcado}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2 }}
      />
      <span>
        <span style={{ fontSize: 12, color: "#0F172A", fontWeight: 700 }}>{rotulo}</span>
        <br />
        <span style={{ fontSize: 11, color: "#64748B" }}>{ajuda}</span>
      </span>
    </label>
  );
}

function Resumo({ n, rotulo, destaque }: { n: number; rotulo: string; destaque?: boolean }) {
  return (
    <div
      style={{
        background: destaque ? "#0DD3C512" : "#F8FAFC",
        border: `1px solid ${destaque ? "#99F6E4" : "#E2E8F0"}`,
        borderRadius: 10,
        padding: "8px 12px",
        minWidth: 110,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 900, color: destaque ? "#0F766E" : "#0F172A" }}>
        {n}
      </div>
      <div style={{ fontSize: 10, color: "#64748B" }}>{rotulo}</div>
    </div>
  );
}

const caixa: CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 14,
  padding: 18,
  marginBottom: 16,
  fontFamily: "Outfit, sans-serif",
};
const linhaResumo: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 };
const aviso: CSSProperties = {
  background: "#FFFBEB",
  border: "1px solid #FDE68A",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 11,
  color: "#78350F",
  lineHeight: 1.6,
  marginTop: 14,
};
const avisoBom: CSSProperties = {
  background: "#F0FDF4",
  border: "1px solid #BBF7D0",
  color: "#166534",
};
const campo: CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: "6px 9px",
  fontSize: 12,
  color: "#0F172A",
  fontFamily: "inherit",
  outline: "none",
};
const botaoPrincipal: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "#0DD3C5",
  border: "none",
  borderRadius: 9,
  padding: "8px 14px",
  color: "#fff",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
  marginTop: 18,
};
const botaoMini: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: "6px 11px",
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
  cursor: "pointer",
  fontFamily: "inherit",
};
const botaoEscolhido: CSSProperties = {
  ...botaoMini,
  background: "#0DD3C5",
  // Borda escrita inteira, e não só a cor: misturar "border" com "borderColor"
  // no mesmo elemento faz o React reclamar e às vezes deixa a cor velha.
  border: "1px solid #0DD3C5",
  color: "#fff",
};
const etiquetaCinza: CSSProperties = {
  display: "inline-block",
  fontSize: 10,
  fontWeight: 700,
  color: "#64748B",
  background: "#F1F5F9",
  borderRadius: 20,
  padding: "3px 9px",
};
