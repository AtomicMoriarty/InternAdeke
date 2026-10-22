-- O estado do escritório dividido por área: uma linha por área, com RLS.
--
-- O dashboard_state é uma linha só. A permissão por área (allowed_modules) só
-- valia na tela: qualquer pessoa logada lia, pela API, LGPD, Societário e
-- Contratos de todos os clientes. E cada gravação reenviava a linha inteira
-- (~200KB) a todos pelo tempo real.
--
-- Agora cada área é uma linha de area_state, e o banco só entrega a linha a
-- quem pode ver aquela área. O tempo real respeita o RLS: cada um recebe só a
-- área que mudou, e só se puder vê-la. É o que o Trello faz com a assinatura
-- por quadro, com a área no lugar do quadro.
--
--   linha "<id da área>" → o objeto da área, igual ao de data.areas
--   linha "_produtos"    → {"produtos": [...]}, módulo "produtos"
--   linha "_comum"       → o resto (clientes, templates, updates…), todo liberado lê
--
-- O espelho em TypeScript é src/lib/estadoPorArea.ts.
--
-- Nada aqui quebra o app publicado: ele continua lendo o dashboard_state, que
-- segue atualizado (o espelho abaixo), e a função antiga de gravar passa a
-- gravar nas duas. Depois de o app novo estar no ar, o arquivo
-- supabase/depois-de-publicar/fechar_dashboard_state.sql desliga o espelho e
-- fecha o dashboard_state — só então o isolamento vale de verdade.

-- ─── Quem vê cada área ───────────────────────────────────────────────────────

-- Mesma regra da tela (allowedModulesFor, em src/lib/areas.ts): sem lista, ou
-- com a lista antiga de acesso total (compliance, lgpd e produtos), vê tudo.
-- Admin sempre vê tudo. Sem perfil vale como liberado, como no resto do app.
create or replace function public.pode_ver_modulo(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.acesso_liberado() and (
    p_modulo is null
    or public.eh_admin()
    or coalesce((
      select case
        when jsonb_typeof(to_jsonb(p) -> 'allowed_modules') is distinct from 'array'
          or jsonb_array_length(to_jsonb(p) -> 'allowed_modules') = 0 then true
        when (to_jsonb(p) -> 'allowed_modules') ?& array['compliance', 'lgpd', 'produtos'] then true
        else (to_jsonb(p) -> 'allowed_modules') ? p_modulo
      end
      from public.profiles p
      where p.id = auth.uid()
    ), true)
  )
$$;

create or replace function public.modulo_da_linha(p_id text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_id when '_comum' then null when '_produtos' then 'produtos' else p_id end
$$;

revoke all on function public.pode_ver_modulo(text) from public, anon;
grant execute on function public.pode_ver_modulo(text) to authenticated, service_role;

-- ─── A tabela ────────────────────────────────────────────────────────────────

create table if not exists public.area_state (
  id text primary key,
  ordem integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  marcas jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.area_state enable row level security;

drop policy if exists "Quem pode ver a área lê" on public.area_state;
create policy "Quem pode ver a área lê" on public.area_state
  for select to authenticated
  using (public.pode_ver_modulo(public.modulo_da_linha(id)));

drop policy if exists "Quem pode ver a área grava" on public.area_state;
create policy "Quem pode ver a área grava" on public.area_state
  for update to authenticated
  using (public.pode_ver_modulo(public.modulo_da_linha(id)))
  with check (public.pode_ver_modulo(public.modulo_da_linha(id)));

drop policy if exists "Quem pode ver a área cria" on public.area_state;
create policy "Quem pode ver a área cria" on public.area_state
  for insert to authenticated
  with check (public.pode_ver_modulo(public.modulo_da_linha(id)));

-- Sem política de delete: área não se apaga pela API.
revoke all on public.area_state from anon;
grant select, insert, update on public.area_state to authenticated;

-- Copia o estado atual. Rodar de novo não sobrescreve o que já foi copiado.
insert into public.area_state (id, ordem, data, updated_at)
select a.el ->> 'id', (a.ord - 1)::integer, a.el, s.updated_at
from public.dashboard_state s,
  lateral jsonb_array_elements(coalesce(s.data -> 'areas', '[]'::jsonb)) with ordinality as a(el, ord)
where s.id = 'main' and jsonb_typeof(a.el -> 'id') = 'string'
on conflict (id) do nothing;

insert into public.area_state (id, ordem, data, updated_at)
select '_produtos', 0, jsonb_build_object('produtos', coalesce(s.data -> 'produtos', '[]'::jsonb)), s.updated_at
from public.dashboard_state s where s.id = 'main'
on conflict (id) do nothing;

insert into public.area_state (id, ordem, data, updated_at)
select '_comum', 0, s.data - 'areas' - 'produtos', s.updated_at
from public.dashboard_state s where s.id = 'main'
on conflict (id) do nothing;

-- Tempo real: cada linha mudada vai só para quem pode lê-la.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'area_state'
  ) then
    alter publication supabase_realtime add table public.area_state;
  end if;
end
$$;

-- ─── Para que linha vai cada operação ────────────────────────────────────────

-- Devolve {linha, op} para cada pedaço. Espelho de rotear() em estadoPorArea.ts.
create or replace function public.area_rotear(op jsonb)
returns table (linha text, op_linha jsonb)
language plpgsql
immutable
set search_path = ''
as $$
declare
  caminho jsonb := op -> 'caminho';
  total integer := jsonb_array_length(op -> 'caminho');
  primeiro jsonb := op -> 'caminho' -> 0;
  segundo jsonb := op -> 'caminho' -> 1;
  tipo text := op ->> 'op';
  el jsonb;
  ord bigint;
begin
  -- O estado inteiro: divide em todas as linhas.
  if total = 0 then
    if tipo <> 'set' or jsonb_typeof(op -> 'valor') <> 'object' then return; end if;
    for el in select value from jsonb_array_elements(coalesce(op -> 'valor' -> 'areas', '[]'::jsonb)) loop
      if jsonb_typeof(el -> 'id') = 'string' then
        linha := el ->> 'id';
        op_linha := jsonb_build_object('op', 'set', 'caminho', '[]'::jsonb, 'valor', el);
        return next;
      end if;
    end loop;
    linha := '_produtos';
    op_linha := jsonb_build_object('op', 'set', 'caminho', '[]'::jsonb, 'valor',
      jsonb_build_object('produtos', coalesce(op -> 'valor' -> 'produtos', '[]'::jsonb)));
    return next;
    linha := '_comum';
    op_linha := jsonb_build_object('op', 'set', 'caminho', '[]'::jsonb, 'valor',
      (op -> 'valor') - 'areas' - 'produtos');
    return next;
    return;
  end if;

  if primeiro = to_jsonb('areas'::text) then
    if total = 1 then
      if tipo <> 'set' or jsonb_typeof(op -> 'valor') <> 'array' then return; end if;
      for el in select value from jsonb_array_elements(op -> 'valor') loop
        if jsonb_typeof(el) = 'object' and jsonb_typeof(el -> 'id') = 'string' then
          linha := el ->> 'id';
          op_linha := jsonb_build_object('op', 'set', 'caminho', '[]'::jsonb, 'valor', el);
          return next;
        end if;
      end loop;
      return;
    end if;
    if jsonb_typeof(segundo) <> 'object' or jsonb_typeof(segundo -> 'id') <> 'string' then
      return;
    end if;
    -- Apagar ou reordenar a área inteira não é edição: as áreas vêm do código.
    if total = 2 and tipo <> 'set' then return; end if;
    linha := segundo ->> 'id';
    op_linha := jsonb_set(op, '{caminho}',
      coalesce((select jsonb_agg(p.value order by p.ord)
                from jsonb_array_elements(caminho) with ordinality as p(value, ord)
                where p.ord > 2), '[]'::jsonb));
    return next;
    return;
  end if;

  if primeiro = to_jsonb('produtos'::text) then
    linha := '_produtos';
  else
    linha := '_comum';
  end if;
  op_linha := op;
  return next;
end
$$;

-- ─── O espelho no dashboard_state antigo ─────────────────────────────────────

-- Enquanto houver aba aberta com o app antigo, o dashboard_state precisa
-- continuar certo. O arquivo de depois de publicar troca isto para false.
create or replace function public.espelho_legado_ativo()
returns boolean
language sql
immutable
set search_path = ''
as $$ select true $$;

-- ─── Gravar ──────────────────────────────────────────────────────────────────

-- Aplica um lote de operações nas linhas. security invoker: vale o RLS de
-- quem chama, e a conferência explícita abaixo dá um erro claro em vez de uma
-- gravação que some em silêncio.
create or replace function public.aplicar_operacoes_areas(
  p_ops jsonb,
  p_marca text default null
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_op jsonb;
  v_r record;
  v_linhas text[];
  v_linha text;
  v_estado jsonb := '{}'::jsonb;  -- {linha: data}
  v_criar text[] := '{}';
  v_agora timestamptz := clock_timestamp();
  v_data jsonb;
  v_marcas jsonb;
begin
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then
    raise exception 'p_ops precisa ser uma lista de operações';
  end if;
  for v_op in select value from jsonb_array_elements(p_ops) loop
    if v_op ->> 'op' not in ('set', 'remove', 'ordem')
       or jsonb_typeof(v_op -> 'caminho') <> 'array' then
      raise exception 'operação inválida: %', v_op;
    end if;
  end loop;

  -- As linhas tocadas, em ordem: travar sempre na mesma ordem evita que dois
  -- lotes que mexem em duas áreas fiquem esperando um pelo outro.
  select coalesce(array_agg(distinct r.linha order by r.linha), '{}') into v_linhas
  from jsonb_array_elements(p_ops) as o(value), lateral public.area_rotear(o.value) as r;

  foreach v_linha in array v_linhas loop
    if not public.pode_ver_modulo(public.modulo_da_linha(v_linha)) then
      raise exception 'sem permissão para gravar em %', v_linha using errcode = '42501';
    end if;
    select data into v_data from public.area_state where id = v_linha for update;
    if found then
      v_estado := v_estado || jsonb_build_object(v_linha, v_data);
    else
      v_criar := v_criar || v_linha;
      v_estado := v_estado || jsonb_build_object(v_linha, '{}'::jsonb);
    end if;
  end loop;

  for v_op in select value from jsonb_array_elements(p_ops) loop
    for v_r in select * from public.area_rotear(v_op) loop
      if jsonb_array_length(v_r.op_linha -> 'caminho') = 0 and v_r.op_linha ->> 'op' <> 'set' then
        continue;
      end if;
      v_estado := jsonb_set(v_estado, array[v_r.linha],
        public.dashboard_aplicar_op(v_estado -> v_r.linha, v_r.op_linha, 0));
    end loop;
  end loop;

  foreach v_linha in array v_linhas loop
    if v_linha = any(v_criar) then
      insert into public.area_state (id, ordem, data, marcas, updated_at)
      values (
        v_linha,
        coalesce((select max(ordem) + 1 from public.area_state), 0),
        v_estado -> v_linha,
        case when p_marca is null then '[]'::jsonb else jsonb_build_array(p_marca) end,
        v_agora
      );
    else
      -- Guarda as últimas 200 marcas, como no dashboard_state.
      select marcas into v_marcas from public.area_state where id = v_linha;
      if p_marca is not null then
        select coalesce(jsonb_agg(m.value order by m.ord), '[]'::jsonb) into v_marcas
        from (
          select value, ord
          from jsonb_array_elements(coalesce(v_marcas, '[]'::jsonb) || to_jsonb(p_marca))
            with ordinality as t(value, ord)
          order by ord desc
          limit 200
        ) as m;
      end if;
      update public.area_state
      set data = v_estado -> v_linha, marcas = v_marcas, updated_at = v_agora
      where id = v_linha;
    end if;
  end loop;

  if public.espelho_legado_ativo() then
    perform public.dashboard_espelhar_operacoes(p_ops, p_marca, v_agora);
  end if;

  return v_agora;
end
$$;

-- O espelho: as mesmas operações no JSON único, do jeito de antes.
create or replace function public.dashboard_espelhar_operacoes(
  p_ops jsonb,
  p_marca text,
  p_agora timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_data jsonb;
  v_marcas jsonb;
  v_op jsonb;
begin
  select data, marcas into v_data, v_marcas
  from public.dashboard_state where id = 'main' for update;
  if not found then return; end if;
  for v_op in select value from jsonb_array_elements(p_ops) loop
    if jsonb_array_length(v_op -> 'caminho') = 0 and v_op ->> 'op' <> 'set' then continue; end if;
    v_data := public.dashboard_aplicar_op(v_data, v_op, 0);
  end loop;
  if p_marca is not null then
    select coalesce(jsonb_agg(m.value order by m.ord), '[]'::jsonb) into v_marcas
    from (
      select value, ord
      from jsonb_array_elements(coalesce(v_marcas, '[]'::jsonb) || to_jsonb(p_marca))
        with ordinality as t(value, ord)
      order by ord desc
      limit 200
    ) as m;
  end if;
  update public.dashboard_state
  set data = v_data, marcas = v_marcas, updated_at = p_agora
  where id = 'main';
end
$$;

-- A função antiga, que as abas com o app publicado chamam, passa a gravar nas
-- linhas (e, pelo espelho, no JSON). Assim nada do que elas gravam se perde.
create or replace function public.aplicar_operacoes_dashboard(
  p_ops jsonb,
  p_marca text default null,
  p_id text default 'main'
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return public.aplicar_operacoes_areas(p_ops, p_marca);
end
$$;

revoke all on function public.aplicar_operacoes_areas(jsonb, text) from public, anon;
grant execute on function public.aplicar_operacoes_areas(jsonb, text) to authenticated, service_role;
revoke all on function public.dashboard_espelhar_operacoes(jsonb, text, timestamptz) from public, anon;
grant execute on function public.dashboard_espelhar_operacoes(jsonb, text, timestamptz)
  to authenticated, service_role;
revoke all on function public.area_rotear(jsonb) from public, anon;
grant execute on function public.area_rotear(jsonb) to authenticated, service_role;
