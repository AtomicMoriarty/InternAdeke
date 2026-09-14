// Diretório único de clientes.
//
// Antes cada área tinha a sua lista de clientes, e a mesma empresa precisava ser
// cadastrada de novo em Compliance, em INPI, em Societário. CNPJ, contatos e
// endereço viviam em três lugares, desencontrados, e ninguém sabia qual estava
// certo.
//
// Agora o cadastro mora aqui, uma vez só. A área guarda um vínculo — quais
// planos e itens aquele cliente tem naquela área — e aponta para o cadastro.
// Trocar o telefone no diretório troca em todas as áreas de uma vez.
//
// O vínculo continua sendo um objeto dentro de area.clientes, com o mesmo
// formato de antes, para não quebrar nada que já lê essa estrutura. O que muda
// é que ele passa a ter clienteId, e o nome vem do diretório.

import type { DashboardState, Area, Cliente, Plano } from "@/lib/dashboardTypes";
import { AREAS, areaById } from "@/lib/areas";

export type ClienteDiretorio = {
  id: string;
  nome: string;
  /** CNPJ ou CPF, como a pessoa escrever. */
  documento?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  /** Contato principal, em texto. A lista completa fica em contatos. */
  contato?: string;
  contatos?: { id: string; nome: string; cargo?: string; telefone?: string; email?: string }[];
  /** Setor, porte, o que o escritório quiser marcar. */
  tags?: string[];
  descricao?: string;
  criadoEm?: string;
  /** Cliente que saiu. Some dos seletores, mas o histórico não se perde. */
  inativo?: boolean;
};

export const CAMPO_VINCULO = "clienteId";

function idCurto(prefixo: string) {
  return `${prefixo}${Math.random().toString(36).slice(2, 9)}`;
}

function semAcento(s: string) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

export function diretorio(data: DashboardState | null): ClienteDiretorio[] {
  const lista = data?.clientes;
  return Array.isArray(lista) ? (lista as ClienteDiretorio[]) : [];
}

/** Só os ativos, em ordem alfabética. É o que vai nos seletores. */
export function clientesAtivos(data: DashboardState | null): ClienteDiretorio[] {
  return diretorio(data)
    .filter((c) => !c.inativo)
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

export function clientePorId(
  data: DashboardState | null,
  id?: string,
): ClienteDiretorio | undefined {
  if (!id) return undefined;
  return diretorio(data).find((c) => c.id === id);
}

/**
 * O nome que se mostra para um vínculo de área.
 *
 * Cai no nome guardado no próprio vínculo quando o cadastro não for encontrado.
 * Isso mantém legível o que foi criado antes do diretório existir, em vez de
 * mostrar vazio.
 */
export function nomeDoVinculo(data: DashboardState | null, vinculo: Cliente): string {
  const doDiretorio = clientePorId(data, vinculo?.[CAMPO_VINCULO] as string | undefined);
  return doDiretorio?.nome || String(vinculo?.name || "");
}

/** O cadastro por trás de um vínculo, com os dados compartilhados. */
export function cadastroDoVinculo(
  data: DashboardState | null,
  vinculo: Cliente,
): ClienteDiretorio | undefined {
  return clientePorId(data, vinculo?.[CAMPO_VINCULO] as string | undefined);
}

export type PresencaEmArea = { areaId: string; areaNome: string; planos: number; itens: number };

/**
 * Em quais áreas este cliente já está, e com quanto trabalho.
 *
 * É o que responde "já mexemos com essa empresa em algum lugar?" sem abrir
 * área por área.
 */
export function presencaDoCliente(
  data: DashboardState | null,
  clienteId: string,
): PresencaEmArea[] {
  const out: PresencaEmArea[] = [];
  for (const area of (data?.areas || []) as Area[]) {
    for (const v of (area.clientes || []) as Cliente[]) {
      if (v[CAMPO_VINCULO] !== clienteId) continue;
      const planos = (v.planos || []) as { items?: unknown[] }[];
      out.push({
        areaId: area.id,
        areaNome: areaById(area.id)?.name || String(area.name || area.id),
        planos: planos.length,
        itens: planos.reduce((s, pl) => s + (pl.items?.length || 0), 0),
      });
    }
  }
  return out;
}

/** Áreas em que o cliente ainda não está, para o botão de adicionar. */
export function areasSemOCliente(data: DashboardState | null, clienteId: string) {
  const jaTem = new Set(presencaDoCliente(data, clienteId).map((p) => p.areaId));
  return AREAS.filter((a) => !jaTem.has(a.id));
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

function comDiretorio(data: DashboardState, lista: ClienteDiretorio[]): DashboardState {
  return { ...data, clientes: lista };
}

/** Já existe alguém com este nome? Evita o mesmo cliente cadastrado duas vezes. */
export function jaExiste(data: DashboardState | null, nome: string, ignorarId?: string) {
  const alvo = semAcento(nome);
  return diretorio(data).some((c) => c.id !== ignorarId && semAcento(c.nome) === alvo);
}

export function salvarCliente(data: DashboardState, cliente: ClienteDiretorio): DashboardState {
  const atuais = diretorio(data);
  const existe = atuais.some((c) => c.id === cliente.id);
  return comDiretorio(
    data,
    existe ? atuais.map((c) => (c.id === cliente.id ? cliente : c)) : [...atuais, cliente],
  );
}

export function clienteNovo(nome: string, agora: Date = new Date()): ClienteDiretorio {
  return {
    id: idCurto("cd"),
    nome: nome.trim(),
    documento: "",
    email: "",
    telefone: "",
    endereco: "",
    contato: "",
    contatos: [],
    tags: [],
    descricao: "",
    criadoEm: agora.toISOString(),
  };
}

/**
 * Tira o cliente de circulação sem apagar o histórico.
 *
 * Apagar de verdade deixaria órfão todo card que já foi feito para ele. Aqui
 * ele some dos seletores e continua nos relatórios e no que já existe.
 */
export function inativarCliente(data: DashboardState, clienteId: string, inativo = true) {
  return comDiretorio(
    data,
    diretorio(data).map((c) => (c.id === clienteId ? { ...c, inativo } : c)),
  );
}

/** Um cliente só pode sair do diretório se não tiver trabalho em área nenhuma. */
export function podeRemover(data: DashboardState | null, clienteId: string): boolean {
  return presencaDoCliente(data, clienteId).length === 0;
}

export function removerCliente(data: DashboardState, clienteId: string): DashboardState {
  if (!podeRemover(data, clienteId)) return data;
  return comDiretorio(
    data,
    diretorio(data).filter((c) => c.id !== clienteId),
  );
}

// ─── Vincular a uma área ─────────────────────────────────────────────────────

/**
 * Coloca um cliente do diretório numa área.
 *
 * Os planos iniciais vêm de fora porque o template de cada área mora no
 * componente. Se o cliente já estiver na área, nada acontece — vincular duas
 * vezes criaria dois quadros para a mesma empresa.
 */
export function vincularNaArea(
  data: DashboardState,
  areaId: string,
  clienteId: string,
  planosIniciais: Plano[] = [],
  responsaveis: string[] = [],
): DashboardState {
  const cadastro = clientePorId(data, clienteId);
  if (!cadastro) return data;

  const area = (data.areas || []).find((a: Area) => a.id === areaId);
  if (!area) return data;
  if (((area.clientes || []) as Cliente[]).some((v) => v[CAMPO_VINCULO] === clienteId)) return data;

  const vinculo: Cliente = {
    id: idCurto("cli"),
    [CAMPO_VINCULO]: clienteId,
    // O nome fica guardado junto como cópia de leitura: o diretório manda, mas
    // se o cadastro sumir o quadro continua legível.
    name: cadastro.nome,
    responsaveis,
    planos: planosIniciais,
    canalEtica: false,
  };

  return {
    ...data,
    areas: (data.areas || []).map((a: Area) =>
      a.id !== areaId ? a : { ...a, clientes: [...((a.clientes || []) as Cliente[]), vinculo] },
    ),
  };
}

/**
 * Mantém a cópia do nome nos vínculos igual à do diretório.
 *
 * Roda depois de renomear alguém no cadastro. Sem isso o quadro continuaria
 * mostrando o nome velho até alguém recarregar com outra lógica.
 */
export function sincronizarNomes(data: DashboardState): DashboardState {
  const porId = new Map(diretorio(data).map((c) => [c.id, c.nome]));
  return {
    ...data,
    areas: (data.areas || []).map((a: Area) => ({
      ...a,
      clientes: ((a.clientes || []) as Cliente[]).map((v) => {
        const nome = porId.get(v[CAMPO_VINCULO] as string);
        return nome && nome !== v.name ? { ...v, name: nome } : v;
      }),
    })),
  };
}

/**
 * Traz para o diretório os clientes que já existiam soltos nas áreas.
 *
 * Roda uma vez, na carga. Clientes com o mesmo nome em áreas diferentes viram
 * um cadastro só — que é justamente o ponto do diretório — e os dados de
 * empresa preenchidos em qualquer uma delas são aproveitados.
 */
export function migrarParaDiretorio(data: DashboardState): DashboardState {
  const areas = (data?.areas || []) as Area[];
  const soltos = areas.flatMap((a) =>
    ((a.clientes || []) as Cliente[]).filter((v) => !v[CAMPO_VINCULO]),
  );
  if (!soltos.length) return data;

  const lista = [...diretorio(data)];
  const porNome = new Map(lista.map((c) => [semAcento(c.nome), c]));

  for (const v of soltos) {
    const nome = String(v.name || "").trim();
    if (!nome) continue;
    const chave = semAcento(nome);
    const dados = (v.dadosEmpresa || {}) as Record<string, string>;
    const existente = porNome.get(chave);

    if (existente) {
      // Completa o que faltava: quem cadastrou em duas áreas raramente
      // preencheu tudo nas duas.
      for (const campo of ["documento", "email", "telefone", "endereco", "contato"] as const) {
        if (!existente[campo] && dados[campo]) existente[campo] = dados[campo];
      }
      if (!existente.descricao && v.descricao) existente.descricao = String(v.descricao);
      const tags = new Set([...(existente.tags || []), ...((v.tags as string[]) || [])]);
      existente.tags = [...tags];
      const contatos = [
        ...(existente.contatos || []),
        ...(((v.contatos as ClienteDiretorio["contatos"]) || []) as NonNullable<
          ClienteDiretorio["contatos"]
        >),
      ];
      const vistos = new Set<string>();
      existente.contatos = contatos.filter((ct) => {
        const k = semAcento(ct.nome);
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      });
      continue;
    }

    const novo: ClienteDiretorio = {
      ...clienteNovo(nome),
      documento: dados.documento || "",
      email: dados.email || "",
      telefone: dados.telefone || "",
      endereco: dados.endereco || "",
      contato: dados.contato || "",
      contatos: ((v.contatos as ClienteDiretorio["contatos"]) ||
        []) as ClienteDiretorio["contatos"],
      tags: ((v.tags as string[]) || []) as string[],
      descricao: String(v.descricao || ""),
    };
    lista.push(novo);
    porNome.set(chave, novo);
  }

  const comLista = comDiretorio(data, lista);
  return {
    ...comLista,
    areas: ((comLista.areas || []) as Area[]).map((a) => ({
      ...a,
      clientes: ((a.clientes || []) as Cliente[]).map((v) => {
        if (v[CAMPO_VINCULO]) return v;
        const achado = porNome.get(semAcento(String(v.name || "")));
        return achado ? { ...v, [CAMPO_VINCULO]: achado.id } : v;
      }),
    })),
  };
}
