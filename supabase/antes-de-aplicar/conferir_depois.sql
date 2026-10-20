-- DEPOIS DE APLICAR AS MIGRAÇÕES — a prova de que valeram.
--
-- Só leitura. Cole no SQL Editor e rode de uma vez. Cada consulta tem uma
-- coluna que diz CERTO ou ERRADO: se alguma disser ERRADO, não publique ainda.
--
-- A pergunta que isto responde é a que o relatório de migração não responde:
-- "a proteção passou mesmo a valer, ou só foi criada ao lado da antiga?"

-- ─── 1. A conferência que decide tudo: sobrou policy permissiva? ────────────
--
-- Policies de RLS somam. Se ficou alguma que libera sem conferir
-- acesso_liberado(), a proteção nova não restringe nada.

select
  policyname as nome_da_policy,
  cmd as operacao,
  coalesce(qual, '(sem condição)') as condicao,
  case
    when coalesce(qual, '') like '%acesso_liberado%' then 'CERTO — confere o acesso'
    when coalesce(qual, '') in ('true', '') and cmd <> 'INSERT' then 'ERRADO — libera sem conferir nada'
    when coalesce(with_check, '') = 'true' and cmd = 'INSERT' then 'ERRADO — libera sem conferir nada'
    else 'OLHAR — condição diferente do esperado'
  end as veredito
from pg_policies
where schemaname = 'public' and tablename = 'dashboard_state'
order by operacao, nome_da_policy;

-- Resumo em uma linha: se "policies_que_liberam_sem_conferir" não for 0,
-- a migração não derrubou as antigas, e é preciso derrubá-las pelo nome real.
select
  count(*) as total_de_policies,
  count(*) filter (where coalesce(qual, '') like '%acesso_liberado%') as policies_novas,
  count(*) filter (
    where coalesce(qual, '') not like '%acesso_liberado%'
      and coalesce(with_check, '') not like '%acesso_liberado%'
  ) as policies_que_liberam_sem_conferir
from pg_policies
where schemaname = 'public' and tablename = 'dashboard_state';

-- ─── 2. As peças novas existem? ─────────────────────────────────────────────

select
  (select count(*) from pg_proc where proname = 'aplicar_operacoes_dashboard') = 1 as funcao_de_operacoes,
  (select count(*) from pg_proc where proname = 'eh_admin') = 1 as funcao_eh_admin,
  (select count(*) from pg_proc where proname = 'acesso_liberado') = 1 as funcao_acesso_liberado,
  (select count(*) from pg_proc where proname = 'pode_ver_valores') = 1 as funcao_pode_ver_valores,
  (select count(*) from pg_class where relname = 'valores_negocio') = 1 as tabela_de_valores,
  (select relrowsecurity from pg_class where relname = 'valores_negocio') as valores_com_rls_ligado,
  (select count(*) from pg_trigger where tgname = 'proteger_permissoes_do_perfil') = 1 as gatilho_do_perfil,
  (select count(*) from information_schema.columns
     where table_name = 'dashboard_state' and column_name = 'marcas') = 1 as coluna_marcas;

-- ─── 3. Nada se perdeu ──────────────────────────────────────────────────────
--
-- Compare com o retrato que o conferir_producao.sql tirou antes.

select
  (select count(*) from jsonb_array_elements((select data -> 'areas' from public.dashboard_state where id = 'main')) a,
     jsonb_array_elements(coalesce(a -> 'clientes', '[]'::jsonb)) v,
     jsonb_array_elements(coalesce(v -> 'planos', '[]'::jsonb)) p,
     jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) i) as cards_agora,
  (select count(*) from jsonb_array_elements(coalesce((select data -> 'clientes' from public.dashboard_state where id = 'main'), '[]'::jsonb))) as clientes_agora,
  (select count(*) from public.profiles) as perfis_agora,
  (select count(*) from public.backup_antes_das_migracoes) as linhas_no_backup;

-- ─── 4. Os valores foram copiados, e batem com o JSON ───────────────────────

with no_json as (
  select
    item ->> 'id' as item_id,
    case jsonb_typeof(item -> 'valor')
      when 'number' then (item ->> 'valor')::numeric
      else nullif(replace(replace(regexp_replace(item ->> 'valor', '[^0-9,]', '', 'g'), ',', '.'), '..', '.'), '')::numeric
    end as valor_json
  from public.dashboard_state s,
    lateral jsonb_path_query(
      s.data, '$.areas[*] ? (@.id == "comercial").clientes[*].planos[*].items[*]'
    ) as item
  where s.id = 'main' and jsonb_typeof(item -> 'id') = 'string'
    and item -> 'valor' is not null and jsonb_typeof(item -> 'valor') <> 'null'
)
select
  (select count(*) from public.valores_negocio) as valores_na_tabela,
  (select count(*) from no_json where valor_json is not null) as valores_legiveis_no_json,
  (select count(*) from no_json j
     left join public.valores_negocio v on v.item_id = j.item_id
     where j.valor_json is not null and v.item_id is null) as ficaram_de_fora,
  (select count(*) from no_json j
     join public.valores_negocio v on v.item_id = j.item_id
     where j.valor_json is distinct from v.valor) as copiados_com_valor_diferente,
  case
    when (select count(*) from no_json j left join public.valores_negocio v on v.item_id = j.item_id
          where j.valor_json is not null and v.item_id is null) = 0
     and (select count(*) from no_json j join public.valores_negocio v on v.item_id = j.item_id
          where j.valor_json is distinct from v.valor) = 0
    then 'CERTO — a tabela bate com o JSON'
    else 'ERRADO — confira antes de limpar o JSON'
  end as veredito;

-- ─── 5. A função de operações faz o que promete ─────────────────────────────
--
-- Ensaio numa linha de mentira, que é apagada no fim. Não toca no estado real.

do $$
declare
  antes jsonb;
  depois jsonb;
begin
  insert into public.dashboard_state (id, data)
  values ('__ensaio__', '{"areas":[{"id":"a1","clientes":[{"id":"c1","name":"Antes"}]}]}'::jsonb)
  on conflict (id) do update set data = excluded.data;

  perform public.aplicar_operacoes_dashboard(
    '[{"op":"set","caminho":["areas",{"id":"a1"},"clientes",{"id":"c1"},"name"],"valor":"Depois"}]'::jsonb,
    'ensaio',
    '__ensaio__'
  );

  select data into depois from public.dashboard_state where id = '__ensaio__';
  if depois #>> '{areas,0,clientes,0,name}' = 'Depois' then
    raise notice 'CERTO — a função aplicou a operação';
  else
    raise warning 'ERRADO — a função não aplicou: %', depois;
  end if;

  delete from public.dashboard_state where id = '__ensaio__';
end
$$;
