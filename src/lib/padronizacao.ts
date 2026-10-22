// Arrumar o cadastro: nomes, clientes repetidos e demandas repetidas.
//
// A importação do Trello trouxe tudo como estava lá: 66 dos 71 clientes e dois
// terços das demandas em CAIXA ALTA, o mesmo cliente com duas grafias
// ("GIOVAN FUSIEGER" e "GIOVAM"), cinco "clientes" que são o próprio
// escritório e a mesma demanda cadastrada quatro vezes. Aqui ficam as regras
// para propor a arrumação; a tela (ArrumarCadastro) mostra antes e depois e só
// grava o que a pessoa confirmar.
//
// Fica sem imports com "@/" para rodar direto no node --test.

import { semAcento } from "./comum.ts";
import type { Area, Cliente, DashboardState, Item, Plano } from "./dashboardTypes";

// ─── Nomes ───────────────────────────────────────────────────────────────────

/** Palavras que ficam minúsculas no meio do nome. */
const MINUSCULAS = new Set(
  "a o as os e de da do das dos em no na nos nas para por pela pelo com ao aos à às sem sob um uma ou".split(
    " ",
  ),
);

/**
 * Siglas que têm vogal e por isso a regra "sem vogal é sigla" não pega.
 * O resto (PLDFT, MSF, FM, CNPJ, BRZ...) é reconhecido sozinho.
 */
const SIGLAS = new Set(
  (
    "INPI OAB LGPD ANPD CPF RJ SP MG RS PR SC BA DF ES GO SA LTDA EIRELI ME EPP TI IA AI API " +
    "ECAC CVM BACEN BCB PIX KYC KYP AML NDA DPO CEO CFO SAAS ERP CRM PJ PF INSS FGTS ICMS ISS " +
    "IPI IR IRPJ CSLL PIS COFINS HBI EFX ONZ OSER ABOVI UE EUA USA EU ID BI SEO EYT MOU SLA " +
    "OKR KPI RH QA UX UI CI CD SPE SCP CS"
  ).split(" "),
);

const VOGAL = /[AEIOUÁÉÍÓÚÂÊÔÃÕÀ]/;

function ehSigla(palavra: string): boolean {
  const limpa = palavra.replace(/[^A-Za-zÀ-ÿ0-9]/g, "");
  if (!limpa) return true;
  if (/\d/.test(limpa)) return true;
  const alta = limpa.toUpperCase();
  if (SIGLAS.has(alta)) return true;
  return limpa.length >= 2 && !VOGAL.test(alta);
}

function capitalizar(p: string): string {
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

/** Ajusta uma palavra, respeitando hífen, barra e ponto ("OAB-RJ", "PLD/FT"). */
function palavra(p: string, primeira: boolean): string {
  if (/[-/.]/.test(p) && p.length > 1) {
    const partes = p.split(/([-/.])/);
    return partes
      .map((parte, i) => {
        if (/^[-/.]$/.test(parte) || !parte) return parte;
        // Depois de ponto, como num endereço: "PEDE.AI" é "Pede.ai". Letra
        // solta continua maiúscula, para "S.A" não virar "S.a".
        if (partes[i - 1] === ".")
          return parte.length > 1 ? parte.toLowerCase() : parte.toUpperCase();
        return palavra(parte, primeira && i === 0);
      })
      .join("");
  }
  if (ehSigla(p)) return p.toUpperCase();
  const minuscula = p.toLowerCase();
  if (!primeira && MINUSCULAS.has(minuscula)) return minuscula;
  return capitalizar(p);
}

/** O nome tem letra minúscula? Então alguém escreveu assim de propósito. */
function temMinuscula(s: string) {
  return /[a-zà-ÿ]/.test(s);
}

/**
 * O nome padronizado: maiúscula no começo das palavras, siglas mantidas,
 * espaços arrumados.
 *
 * Só mexe na caixa de quem está todo em MAIÚSCULAS: um nome com minúsculas foi
 * escrito assim por alguém ("i9DC", "Contrato | CAP Clube") e é respeitado.
 * Nome de cliente com até quatro letras fica como está: é marca ou sigla
 * ("MODO", "OLRA", "PSAV"), e adivinhar erraria.
 */
export function nomePadronizado(nome: string, opcoes: { cliente?: boolean } = {}): string {
  const limpo = String(nome || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpo || temMinuscula(limpo)) return limpo;
  if (opcoes.cliente && limpo.replace(/[^A-Za-zÀ-ÿ0-9]/g, "").length <= 4) return limpo;
  return limpo
    .split(" ")
    .map((p, i) => palavra(p, i === 0))
    .join(" ");
}

export type PropostaNome = {
  chave: string;
  tipo: "cliente" | "demanda";
  /** Id do cliente no diretório, ou do item. */
  id: string;
  /** Onde a demanda mora, para mostrar e aplicar. */
  onde?: string;
  antes: string;
  depois: string;
};

type Diretorio = { id: string; nome: string; apelidos?: string[]; [k: string]: unknown };

function diretorio(data: DashboardState): Diretorio[] {
  return Array.isArray(data.clientes) ? (data.clientes as Diretorio[]) : [];
}

/** Tudo que mudaria de nome, clientes primeiro. */
export function propostasDeNome(data: DashboardState): PropostaNome[] {
  const out: PropostaNome[] = [];
  for (const c of diretorio(data)) {
    const depois = nomePadronizado(c.nome, { cliente: true });
    if (depois !== c.nome)
      out.push({ chave: `c:${c.id}`, tipo: "cliente", id: c.id, antes: c.nome, depois });
  }
  for (const area of data.areas || []) {
    for (const v of area.clientes || []) {
      for (const p of v.planos || []) {
        for (const it of p.items || []) {
          const depois = nomePadronizado(it.name);
          if (depois !== it.name) {
            out.push({
              chave: `d:${it.id}`,
              tipo: "demanda",
              id: it.id,
              onde: v.name,
              antes: it.name,
              depois,
            });
          }
        }
      }
    }
  }
  return out;
}

/** Aplica as propostas escolhidas (pela chave). O nome no vínculo acompanha o do diretório. */
export function aplicarNomes(data: DashboardState, escolhidas: PropostaNome[]): DashboardState {
  const clientes = new Map(
    escolhidas.filter((p) => p.tipo === "cliente").map((p) => [p.id, p.depois]),
  );
  const demandas = new Map(
    escolhidas.filter((p) => p.tipo === "demanda").map((p) => [p.id, p.depois]),
  );
  if (!clientes.size && !demandas.size) return data;
  return {
    ...data,
    clientes: diretorio(data).map((c) =>
      clientes.has(c.id) ? { ...c, nome: clientes.get(c.id)! } : c,
    ),
    areas: (data.areas || []).map((a) => ({
      ...a,
      clientes: (a.clientes || []).map((v) => {
        const novoNome = clientes.get(v.clienteId as string);
        return {
          ...v,
          ...(novoNome ? { name: novoNome } : {}),
          planos: (v.planos || []).map((p) => ({
            ...p,
            items: (p.items || []).map((it) =>
              demandas.has(it.id) ? { ...it, name: demandas.get(it.id)! } : it,
            ),
          })),
        };
      }),
    })),
  };
}

// ─── Clientes parecidos ─────────────────────────────────────────────────────

function chave(s: string) {
  return semAcento(s).replace(/[^a-z0-9]/g, "");
}

/** Distância de edição (Levenshtein), para pegar "GIOVAM" × "GIOVAN". */
function distancia(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return d[a.length][b.length];
}

export type ParParecido = { a: Diretorio; b: Diretorio; motivo: string };

/**
 * Pares de clientes com nome parecido, que ninguém disse ainda que são
 * empresas diferentes: mesma primeira palavra ("OASIS" e "OASIS HUB"), ou
 * diferença de uma ou duas letras ("ORLA" e "OLRA").
 */
export function clientesParecidos(data: DashboardState): ParParecido[] {
  const distintos = (
    Array.isArray(data.clientesDistintos) ? data.clientesDistintos : []
  ) as string[][];
  const jaDisse = new Set(distintos.map(([x, y]) => [chave(x), chave(y)].sort().join("|")));
  const lista = diretorio(data).filter((c) => !c.inativo);
  const pares: ParParecido[] = [];
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const [a, b] = [lista[i], lista[j]];
      const [ka, kb] = [chave(a.nome), chave(b.nome)];
      if (!ka || !kb || jaDisse.has([ka, kb].sort().join("|"))) continue;
      const pa = semAcento(a.nome).split(" ")[0];
      const pb = semAcento(b.nome).split(" ")[0];
      const curta = Math.min(ka.length, kb.length);
      let motivo = "";
      if (pa.length >= 3 && pa === pb) motivo = "começam com a mesma palavra";
      else if (Math.min(pa.length, pb.length) >= 5 && distancia(pa, pb) <= 1) {
        motivo = "primeira palavra com uma letra de diferença";
      } else if (curta >= 4 && distancia(ka, kb) <= (curta >= 8 ? 2 : 1))
        motivo = "diferença de uma ou duas letras";
      else if (curta >= 5 && (ka.startsWith(kb) || kb.startsWith(ka)))
        motivo = "um nome contém o outro";
      if (motivo) pares.push({ a, b, motivo });
    }
  }
  return pares;
}

/**
 * Clientes já cadastrados com nome parecido com este, para avisar antes de
 * criar mais um "GIOVAM" ao lado do "GIOVAN FUSIEGER".
 */
export function parecidosCom(data: DashboardState, nome: string): string[] {
  const k = chave(nome);
  if (k.length < 3) return [];
  const p = semAcento(nome).split(" ")[0];
  return diretorio(data)
    .filter((c) => !c.inativo)
    .filter((c) => {
      const kc = chave(c.nome);
      const pc = semAcento(c.nome).split(" ")[0];
      const curta = Math.min(k.length, kc.length);
      return (
        kc === k ||
        (p.length >= 3 && p === pc) ||
        (Math.min(p.length, pc.length) >= 5 && distancia(p, pc) <= 1) ||
        (curta >= 4 && distancia(k, kc) <= (curta >= 8 ? 2 : 1)) ||
        (curta >= 5 && (k.startsWith(kc) || kc.startsWith(k)))
      );
    })
    .map((c) => c.nome);
}

/** Marca dois clientes como empresas diferentes do mesmo grupo: etiqueta "Grupo X" nos dois. */
export function marcarMesmoGrupo(
  data: DashboardState,
  idA: string,
  idB: string,
  grupo: string,
): DashboardState {
  const etiqueta = `Grupo ${grupo.trim()}`;
  const dir = diretorio(data);
  const a = dir.find((c) => c.id === idA);
  const b = dir.find((c) => c.id === idB);
  if (!a || !b) return data;
  const comEtiqueta = (c: Diretorio) => {
    const tags = Array.isArray(c.tags) ? (c.tags as string[]) : [];
    return tags.includes(etiqueta) ? c : { ...c, tags: [...tags, etiqueta] };
  };
  return {
    ...data,
    clientes: dir.map((c) => (c.id === idA || c.id === idB ? comEtiqueta(c) : c)),
    clientesDistintos: [
      ...((Array.isArray(data.clientesDistintos) ? data.clientesDistintos : []) as string[][]),
      [a.nome, b.nome],
    ],
  };
}

/** Marca dois clientes como diferentes, sem grupo: o par não volta a ser sugerido. */
export function marcarDiferentes(data: DashboardState, idA: string, idB: string): DashboardState {
  const dir = diretorio(data);
  const a = dir.find((c) => c.id === idA);
  const b = dir.find((c) => c.id === idB);
  if (!a || !b) return data;
  return {
    ...data,
    clientesDistintos: [
      ...((Array.isArray(data.clientesDistintos) ? data.clientesDistintos : []) as string[][]),
      [a.nome, b.nome],
    ],
  };
}

// ─── Unir e apagar clientes ─────────────────────────────────────────────────

function juntarPlanos(destino: Plano[], vindos: Plano[]): Plano[] {
  const saida: Plano[] = destino.map((p) => ({ ...p, items: [...(p.items || [])] }));
  for (const p of vindos) {
    const igual = saida.find((d) => semAcento(d.name) === semAcento(p.name));
    if (igual) igual.items = [...(igual.items || []), ...(p.items || [])];
    else saida.push(p);
  }
  return saida;
}

/**
 * Une dois clientes: tudo do absorvido passa para o que fica.
 *
 * Em cada área, as demandas do absorvido entram no plano de mesmo nome do que
 * fica (ou viram um plano novo); se o que fica não estava na área, o vínculo
 * do absorvido só passa a apontar para ele. No diretório, o nome absorvido
 * vira apelido — a próxima importação já sabe que é o mesmo — e os dados que
 * faltavam (CNPJ, contato...) são aproveitados. Os ids das demandas não mudam:
 * links e notificações continuam abrindo o card certo.
 */
export function unirClientes(data: DashboardState, ficaId: string, saiId: string): DashboardState {
  if (ficaId === saiId) return data;
  const dir = diretorio(data);
  const fica = dir.find((c) => c.id === ficaId);
  const sai = dir.find((c) => c.id === saiId);
  if (!fica || !sai) return data;

  const areas = (data.areas || []).map((a: Area) => {
    const vinculos = (a.clientes || []) as Cliente[];
    const vSai = vinculos.find((v) => v.clienteId === saiId);
    if (!vSai) return a;
    const vFica = vinculos.find((v) => v.clienteId === ficaId);
    if (!vFica) {
      return {
        ...a,
        clientes: vinculos.map((v) =>
          v === vSai ? { ...v, clienteId: ficaId, name: fica.nome } : v,
        ),
      };
    }
    const resp = [
      ...new Set([
        ...((vFica.responsaveis as string[]) || []),
        ...((vSai.responsaveis as string[]) || []),
      ]),
    ];
    return {
      ...a,
      clientes: vinculos
        .filter((v) => v !== vSai)
        .map((v) =>
          v === vFica
            ? { ...v, responsaveis: resp, planos: juntarPlanos(v.planos || [], vSai.planos || []) }
            : v,
        ),
    };
  });

  const campos = ["documento", "email", "telefone", "endereco", "contato", "descricao"];
  const unido: Diretorio = { ...fica };
  for (const k of campos) if (!unido[k] && sai[k]) unido[k] = sai[k];
  const apelidos = [...(fica.apelidos || []), sai.nome, ...(sai.apelidos || [])];
  unido.apelidos = [...new Map(apelidos.map((x) => [chave(x), x])).values()].filter(
    (x) => chave(x) !== chave(fica.nome),
  );
  unido.tags = [
    ...new Set([...((fica.tags as string[]) || []), ...((sai.tags as string[]) || [])]),
  ];
  unido.contatos = [
    ...((fica.contatos as unknown[]) || []),
    ...((sai.contatos as unknown[]) || []),
  ];

  return {
    ...data,
    areas,
    clientes: dir.filter((c) => c.id !== saiId).map((c) => (c.id === ficaId ? unido : c)),
  };
}

/** Quantas demandas o cliente tem, somando as áreas. */
export function demandasDoCliente(data: DashboardState, clienteId: string): number {
  let n = 0;
  for (const a of data.areas || []) {
    for (const v of (a.clientes || []) as Cliente[]) {
      if (v.clienteId !== clienteId) continue;
      for (const p of v.planos || []) n += (p.items || []).length;
    }
  }
  return n;
}

/** Apaga o cliente e tudo dele em todas as áreas. */
export function apagarCliente(data: DashboardState, clienteId: string): DashboardState {
  return {
    ...data,
    areas: (data.areas || []).map((a) => ({
      ...a,
      clientes: ((a.clientes || []) as Cliente[]).filter((v) => v.clienteId !== clienteId),
    })),
    clientes: diretorio(data).filter((c) => c.id !== clienteId),
  };
}

// ─── Demandas repetidas ─────────────────────────────────────────────────────

export type Ocorrencia = { areaId: string; vinculoId: string; planoId: string; item: Item };
export type Repeticao = { chave: string; cliente: string; nome: string; itens: Ocorrencia[] };

/** Demandas com o mesmo nome no mesmo cliente (somando as áreas). */
export function demandasRepetidas(data: DashboardState): Repeticao[] {
  const grupos = new Map<string, Repeticao>();
  for (const a of data.areas || []) {
    for (const v of (a.clientes || []) as Cliente[]) {
      const cli = (v.clienteId as string) || v.id;
      for (const p of v.planos || []) {
        for (const it of p.items || []) {
          const k = `${cli}|${chave(it.name)}`;
          if (!chave(it.name)) continue;
          const g = grupos.get(k) || { chave: k, cliente: v.name, nome: it.name, itens: [] };
          g.itens.push({ areaId: a.id, vinculoId: v.id, planoId: p.id, item: it });
          grupos.set(k, g);
        }
      }
    }
  }
  return [...grupos.values()]
    .filter((g) => g.itens.length > 1)
    .sort((x, y) => y.itens.length - x.itens.length || x.cliente.localeCompare(y.cliente));
}

/** Apaga uma demanda pelo id, onde quer que ela esteja. */
export function apagarDemanda(data: DashboardState, itemId: string): DashboardState {
  return {
    ...data,
    areas: (data.areas || []).map((a) => ({
      ...a,
      clientes: ((a.clientes || []) as Cliente[]).map((v) => ({
        ...v,
        planos: (v.planos || []).map((p) => ({
          ...p,
          items: (p.items || []).filter((it) => it.id !== itemId),
        })),
      })),
    })),
  };
}
