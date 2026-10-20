-- Permissões que só existiam na tela passam a valer no banco.
--
-- Três buracos, todos do mesmo tipo: a tela escondia, o banco entregava.
--
-- 1. Perfil. A regra "cada um edita o próprio perfil" não olhava as colunas.
--    Qualquer pessoa logada podia, pela API, marcar a si mesma como admin ou
--    liberar pode_ver_valores. Agora só um admin muda role, access_enabled,
--    allowed_modules e pode_ver_valores; nome, cor e o resto continuam livres.
--
-- 2. Acesso desativado. access_enabled = false só era conferido no formulário
--    de login: a sessão que já estava aberta, ou uma chamada direta à API,
--    continuava lendo e gravando tudo. Agora o dashboard_state também confere.
--
-- 3. Valores dos negócios. Moravam dentro do JSON que todo mundo baixa
--    inteiro. Agora moram em valores_negocio, que o banco só entrega a quem
--    pode ver. Esta migração copia os valores que já existem; tirar do JSON
--    fica para depois de o app novo estar publicado (supabase/depois-de-publicar).
--
-- As colunas role, access_enabled, allowed_modules e pode_ver_valores foram
-- criadas por fora das migrações em algum momento. Por isso tudo aqui lê o
-- perfil como jsonb: funciona com ou sem cada coluna, sem quebrar.

-- ─── Quem é admin, quem pode ver valores, quem está liberado ─────────────────

-- O e-mail fixo é o mesmo que a tela já trata como admin (routes/eu.tsx), para
-- o escritório nunca ficar sem ninguém que consiga liberar os outros.
create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select to_jsonb(p) ->> 'role' = 'admin' from public.profiles p where p.id = auth.uid()),
    false
  ) or coalesce(lower(auth.jwt() ->> 'email') = 'portoepacca@portoepacca.com', false)
$$;

create or replace function public.pode_ver_valores()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.eh_admin() or coalesce(
    (select (to_jsonb(p) ->> 'pode_ver_valores')::boolean
       from public.profiles p where p.id = auth.uid()),
    false
  )
$$;

-- Sem perfil, ou sem a coluna, conta como liberado: é o comportamento de hoje.
create or replace function public.acesso_liberado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (to_jsonb(p) ->> 'access_enabled')::boolean
       from public.profiles p where p.id = auth.uid()),
    true
  )
$$;

revoke all on function public.eh_admin() from public, anon;
revoke all on function public.pode_ver_valores() from public, anon;
revoke all on function public.acesso_liberado() from public, anon;
grant execute on function public.eh_admin() to authenticated, service_role;
grant execute on function public.pode_ver_valores() to authenticated, service_role;
grant execute on function public.acesso_liberado() to authenticated, service_role;

-- ─── 1. Perfil: colunas de permissão só mudam pela mão de um admin ───────────

create or replace function public.proteger_permissoes_do_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  campo text;
begin
  -- Sem usuário na requisição é o próprio sistema: o cadastro de usuário
  -- novo, o painel do Supabase, a chave de serviço.
  if auth.uid() is null or public.eh_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if to_jsonb(new) ->> 'role' = 'admin'
       or (to_jsonb(new) ->> 'pode_ver_valores')::boolean is true then
      raise exception 'Só um administrador pode criar perfil com permissões.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  foreach campo in array array['role', 'access_enabled', 'allowed_modules', 'pode_ver_valores'] loop
    if (to_jsonb(new) -> campo) is distinct from (to_jsonb(old) -> campo) then
      raise exception 'Só um administrador pode mudar %.', campo
        using errcode = '42501';
    end if;
  end loop;
  return new;
end
$$;

drop trigger if exists proteger_permissoes_do_perfil on public.profiles;
create trigger proteger_permissoes_do_perfil
  before insert or update on public.profiles
  for each row execute function public.proteger_permissoes_do_perfil();

-- A tela de administração (routes/eu.tsx) muda o perfil dos outros. Com a
-- regra antiga, de cada um só editar o próprio, isso dependia de alguma regra
-- criada por fora. Esta deixa explícito: admin edita qualquer perfil.
drop policy if exists "Admin edita qualquer perfil" on public.profiles;
create policy "Admin edita qualquer perfil"
  on public.profiles for update to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

-- ─── 2. Acesso desativado vale no banco, não só no login ─────────────────────

drop policy if exists "Authenticated can read dashboard" on public.dashboard_state;
drop policy if exists "Authenticated can insert dashboard" on public.dashboard_state;
drop policy if exists "Authenticated can update dashboard" on public.dashboard_state;
drop policy if exists "Liberado lê o dashboard" on public.dashboard_state;
drop policy if exists "Liberado cria o dashboard" on public.dashboard_state;
drop policy if exists "Liberado grava o dashboard" on public.dashboard_state;

create policy "Liberado lê o dashboard"
  on public.dashboard_state for select to authenticated
  using (public.acesso_liberado());
create policy "Liberado cria o dashboard"
  on public.dashboard_state for insert to authenticated
  with check (public.acesso_liberado());
create policy "Liberado grava o dashboard"
  on public.dashboard_state for update to authenticated
  using (public.acesso_liberado())
  with check (public.acesso_liberado());

-- ─── 3. Valores dos negócios numa tabela que o banco protege ─────────────────

create table if not exists public.valores_negocio (
  item_id text primary key,
  valor numeric not null default 0,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users (id) on delete set null
);

alter table public.valores_negocio enable row level security;

drop policy if exists "Quem pode ver valores lê" on public.valores_negocio;
drop policy if exists "Quem pode ver valores grava" on public.valores_negocio;
create policy "Quem pode ver valores lê"
  on public.valores_negocio for select to authenticated
  using (public.pode_ver_valores() and public.acesso_liberado());
create policy "Quem pode ver valores grava"
  on public.valores_negocio for all to authenticated
  using (public.pode_ver_valores() and public.acesso_liberado())
  with check (public.pode_ver_valores() and public.acesso_liberado());

grant select, insert, update, delete on public.valores_negocio to authenticated;
revoke all on public.valores_negocio from anon;

create or replace function public.carimbar_valor_negocio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  return new;
end
$$;

drop trigger if exists carimbar_valor_negocio on public.valores_negocio;
create trigger carimbar_valor_negocio
  before insert or update on public.valores_negocio
  for each row execute function public.carimbar_valor_negocio();

-- Copia os valores que hoje estão no JSON. Texto vira número do mesmo jeito
-- que a tela lê: "8.500" e "R$ 8.500,00" são oito mil e quinhentos. O que não
-- der para ler fica de fora e continua no JSON até alguém corrigir na tela.
insert into public.valores_negocio (item_id, valor)
select distinct on (item ->> 'id')
  item ->> 'id',
  case jsonb_typeof(item -> 'valor')
    when 'number' then (item ->> 'valor')::numeric
    else replace(
      replace(regexp_replace(item ->> 'valor', '[^0-9,]', '', 'g'), ',', '.'),
      '..', '.'
    )::numeric
  end
from public.dashboard_state s,
  lateral jsonb_path_query(
    s.data,
    '$.areas[*] ? (@.id == "comercial").clientes[*].planos[*].items[*]'
  ) as item
where s.id = 'main'
  and jsonb_typeof(item -> 'id') = 'string'
  and (
    jsonb_typeof(item -> 'valor') = 'number'
    or (item ->> 'valor') ~ '^\s*(R\$)?\s*[0-9][0-9.]*(,[0-9]+)?\s*$'
  )
on conflict (item_id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'valores_negocio'
  ) then
    alter publication supabase_realtime add table public.valores_negocio;
  end if;
end
$$;
