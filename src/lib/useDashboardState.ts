// Leitura e escrita do dashboard_state, com uma cópia só para o app inteiro.
//
// O estado é um JSON único de quase meio mega. Antes cada tela que precisava
// dele fazia a sua própria busca e abria o seu próprio canal de tempo real:
// abrir o Quadro Geral baixava tudo, clicar num card baixava tudo de novo, e o
// servidor fica na Califórnia — cada ida e volta custa uns 200ms antes de
// qualquer byte começar a andar.
//
// Agora existe uma cópia só, num módulo. Quem chama o hook se inscreve nela: o
// primeiro pede ao servidor, os outros recebem o que já está em memória, na
// hora. Um canal de tempo real para todos, e a comparação do que chega é feita
// uma vez em vez de uma por tela.
//
// O que não mudou, e é a limitação de fundo: gravar continua reenviando o
// estado inteiro, porque ele é uma linha só. Enquanto for assim, cada edição
// sobe ~470KB.

import { useCallback, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DashboardState } from "@/lib/dashboardTypes";

const ROW_ID = "main";

type Ouvinte = () => void;

const loja = {
  data: null as DashboardState | null,
  carregado: false,
  /** O que este navegador mandou por último, para ignorar o próprio eco. */
  ultimoEnviado: "",
  /** Há escrita nossa em voo: o eco de terceiros espera, para não desfazer. */
  gravando: false,
  ouvintes: new Set<Ouvinte>(),
  canal: null as ReturnType<typeof supabase.channel> | null,
  carregando: null as Promise<void> | null,
  timerGravacao: null as ReturnType<typeof setTimeout> | null,
};

function avisar() {
  for (const o of loja.ouvintes) o();
}

function publicar(novo: DashboardState | null, carregado = true) {
  loja.data = novo;
  loja.carregado = carregado;
  avisar();
}

/**
 * Entrega o estado que já foi carregado por outro caminho.
 *
 * O painel tem o seu próprio carregamento, mais antigo, que também aplica as
 * migrações de carga. Sem isto, abrir um card a partir dele buscaria tudo de
 * novo — a mesma meia mega que acabou de chegar.
 */
export function semearDashboardState(data: DashboardState) {
  loja.data = data;
  loja.carregado = true;
  avisar();
}

async function carregar() {
  if (loja.carregando) return loja.carregando;
  loja.carregando = (async () => {
    const { data: row } = await supabase
      .from("dashboard_state")
      .select("data")
      .eq("id", ROW_ID)
      .maybeSingle();
    // O cliente gerado tipa a coluna como Json; a forma do blob é nossa.
    if (row?.data) publicar(row.data as unknown as DashboardState);
    else publicar(loja.data, true);
  })().finally(() => {
    loja.carregando = null;
  });
  return loja.carregando;
}

function assinarRealtime() {
  if (loja.canal) return;
  loja.canal = supabase
    .channel("dashboard_state_compartilhado")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "dashboard_state", filter: `id=eq.${ROW_ID}` },
      (payload: { new?: { data?: DashboardState } }) => {
        const novo = payload.new?.data;
        if (!novo) return;
        if (loja.gravando) return;
        // A comparação custa serializar meio mega. Com uma loja só, ela
        // acontece uma vez por mudança em vez de uma vez por tela aberta.
        const json = JSON.stringify(novo);
        if (json === loja.ultimoEnviado) return;
        loja.ultimoEnviado = json;
        publicar(novo);
      },
    )
    .subscribe();
}

function inscrever(o: Ouvinte) {
  loja.ouvintes.add(o);
  assinarRealtime();
  if (!loja.carregado) void carregar();
  return () => {
    loja.ouvintes.delete(o);
    // O canal fica de pé enquanto a aba viver: derrubar e reabrir a cada troca
    // de tela custaria mais do que mantê-lo.
  };
}

const lerData = () => loja.data;
const lerCarregado = () => loja.carregado;
const noServidor = () => null;
const carregadoNoServidor = () => false;

/**
 * Grava, juntando o que várias telas mudarem na mesma janela de tempo.
 *
 * O espaço de meio segundo existe para quem digita: sem ele, cada tecla
 * mandaria o estado inteiro. É o mesmo motivo de a gravação sair daqui e não
 * de cada tela — duas telas abertas gravariam duas vezes a mesma coisa.
 */
function agendarGravacao() {
  loja.gravando = true;
  if (loja.timerGravacao) clearTimeout(loja.timerGravacao);
  loja.timerGravacao = setTimeout(async () => {
    const instantaneo = loja.data;
    const json = JSON.stringify(instantaneo);
    loja.ultimoEnviado = json;
    await supabase
      .from("dashboard_state")
      .update({ data: instantaneo as never, updated_at: new Date().toISOString() })
      .eq("id", ROW_ID);
    // Só libera o eco de terceiros se ninguém mexeu enquanto isto subia.
    if (loja.data === instantaneo) loja.gravando = false;
  }, 500);
}

export function useDashboardState(_escopo = "default") {
  const data = useSyncExternalStore(inscrever, lerData, noServidor);
  const loaded = useSyncExternalStore(inscrever, lerCarregado, carregadoNoServidor);

  const update = useCallback((updater: (prev: DashboardState) => DashboardState) => {
    if (!loja.data) return;
    publicar(updater(loja.data));
    agendarGravacao();
  }, []);

  return { data, loaded, update };
}

/**
 * Recarrega do servidor, jogando fora o que está em memória.
 *
 * Serve para quando alguém sabe que o estado mudou por fora — uma importação
 * grande, ou uma correção feita direto no banco.
 */
export function recarregarDashboardState() {
  loja.carregado = false;
  return carregar();
}
