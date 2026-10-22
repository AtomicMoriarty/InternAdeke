-- Folha de horas: quanto tempo cada pessoa passou em cada demanda.
--
-- Um apontamento é um intervalo de trabalho: quem, em que card (e, se for o
-- caso, em que item da checklist — a "subdemanda"), de quando a quando, e o
-- que foi feito. Com fim nulo é um cronômetro rodando: o início fica gravado
-- no banco, então fechar a aba ou trocar de computador não perde a contagem.
--
-- Mora fora do estado das áreas de propósito. Somar horas por cliente, por
-- mês e por pessoa é consulta, e consulta é coisa de tabela; e o estado, que
-- todo mundo baixa inteiro, não precisa carregar o histórico de horas.
--
-- Os nomes (cliente, plano, demanda, subdemanda) são guardados como estavam
-- na hora do apontamento: a folha registra o que era o trabalho naquele dia,
-- mesmo que o card mude de nome depois.
--
-- Quem lê: quem pode ver a área do card (mesma regra de area_state). Quem
-- grava: só a própria pessoa, nos seus apontamentos; o admin corrige qualquer
-- um.

create table if not exists public.apontamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  area_id text not null,
  cliente_id text not null,
  -- Id do cliente no diretório: soma o mesmo cliente em todas as áreas.
  cliente_dir_id text,
  cliente_nome text not null default '',
  plano_id text,
  plano_nome text not null default '',
  item_id text not null,
  item_nome text not null default '',
  subitem_id text,
  subitem_nome text,
  descricao text not null default '',
  inicio timestamptz not null,
  fim timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apontamento_fim_depois_do_inicio check (fim is null or fim > inicio),
  -- Um apontamento não passa de 24 horas: o que for mais que isso é cronômetro
  -- esquecido ligado, e a tela pede para corrigir antes de gravar.
  constraint apontamento_ate_24h check (fim is null or fim - inicio <= interval '24 hours')
);

-- Um cronômetro por pessoa: começar outro encerra o anterior (iniciar_cronometro).
create unique index if not exists apontamentos_um_cronometro_por_pessoa
  on public.apontamentos (user_id) where fim is null;
create index if not exists apontamentos_item on public.apontamentos (item_id);
create index if not exists apontamentos_inicio on public.apontamentos (inicio);
create index if not exists apontamentos_cliente_dir on public.apontamentos (cliente_dir_id);

alter table public.apontamentos enable row level security;

drop policy if exists "Quem vê a área lê os apontamentos" on public.apontamentos;
create policy "Quem vê a área lê os apontamentos" on public.apontamentos
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.pode_ver_modulo(public.modulo_da_linha(area_id))
  );

drop policy if exists "Cada um lança o seu tempo" on public.apontamentos;
create policy "Cada um lança o seu tempo" on public.apontamentos
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.pode_ver_modulo(public.modulo_da_linha(area_id))
  );

drop policy if exists "Cada um corrige o seu tempo" on public.apontamentos;
create policy "Cada um corrige o seu tempo" on public.apontamentos
  for update to authenticated
  using ((user_id = auth.uid() and public.acesso_liberado()) or public.eh_admin())
  with check ((user_id = auth.uid() and public.acesso_liberado()) or public.eh_admin());

drop policy if exists "Cada um apaga o seu tempo" on public.apontamentos;
create policy "Cada um apaga o seu tempo" on public.apontamentos
  for delete to authenticated
  using ((user_id = auth.uid() and public.acesso_liberado()) or public.eh_admin());

revoke all on public.apontamentos from anon;
grant select, insert, update, delete on public.apontamentos to authenticated;

create or replace function public.carimbar_apontamento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  -- Ninguém muda o dono de um apontamento, nem o admin ao corrigir.
  if tg_op = 'UPDATE' then new.user_id := old.user_id; end if;
  return new;
end
$$;
revoke execute on function public.carimbar_apontamento() from public, anon, authenticated;

drop trigger if exists carimbar_apontamento on public.apontamentos;
create trigger carimbar_apontamento
  before insert or update on public.apontamentos
  for each row execute function public.carimbar_apontamento();

-- Começar um cronômetro encerra o que estiver rodando, numa transação só:
-- trocar de demanda é um clique, como no Toggl e no Clockify.
create or replace function public.iniciar_cronometro(p_apontamento jsonb)
returns public.apontamentos
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_agora timestamptz := now();
  v_novo public.apontamentos;
begin
  -- O anterior fecha agora, mas nunca com mais de 24 horas: cronômetro
  -- esquecido de um dia para o outro fica no teto, para a pessoa corrigir.
  update public.apontamentos
  set fim = least(greatest(v_agora, inicio + interval '1 second'), inicio + interval '24 hours')
  where user_id = auth.uid() and fim is null;

  insert into public.apontamentos (
    area_id, cliente_id, cliente_dir_id, cliente_nome, plano_id, plano_nome,
    item_id, item_nome, subitem_id, subitem_nome, descricao, inicio
  ) values (
    p_apontamento ->> 'area_id',
    p_apontamento ->> 'cliente_id',
    p_apontamento ->> 'cliente_dir_id',
    coalesce(p_apontamento ->> 'cliente_nome', ''),
    p_apontamento ->> 'plano_id',
    coalesce(p_apontamento ->> 'plano_nome', ''),
    p_apontamento ->> 'item_id',
    coalesce(p_apontamento ->> 'item_nome', ''),
    p_apontamento ->> 'subitem_id',
    p_apontamento ->> 'subitem_nome',
    coalesce(p_apontamento ->> 'descricao', ''),
    v_agora
  )
  returning * into v_novo;
  return v_novo;
end
$$;

revoke all on function public.iniciar_cronometro(jsonb) from public, anon;
grant execute on function public.iniciar_cronometro(jsonb) to authenticated;

-- Tempo real: o cronômetro aparece e some em todas as abas da pessoa, e o
-- total do card muda para quem está com ele aberto.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'apontamentos'
  ) then
    alter publication supabase_realtime add table public.apontamentos;
  end if;
end
$$;
