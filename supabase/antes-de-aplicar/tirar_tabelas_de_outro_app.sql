-- Tira do projeto as tabelas de um app de luta que nunca foi do escritório.
--
-- Elas ficaram num Supabase compartilhado entre dois sistemas e sobraram aqui:
-- ocupam 27 MB e têm ZERO linhas, todas elas. Não são lidas por nenhuma parte
-- do AdekeIntern — nenhuma aparece em src/.
--
-- O estrago que faziam não era lentidão, era confusão: quem abre o painel do
-- Supabase vê "fighters" e "fights" e acha que está no projeto errado.
--
-- Rode no SQL Editor. O primeiro bloco confere que estão mesmo vazias e não
-- apaga nada; só rode o segundo se o primeiro disser que está livre.

-- ─── 1. Conferir antes. Nenhuma linha some neste bloco. ─────────────────────

select
  c.relname as tabela,
  coalesce(s.n_live_tup, 0) as linhas,
  pg_size_pretty(pg_total_relation_size(c.oid)) as espaco,
  case when coalesce(s.n_live_tup, 0) = 0 then 'vazia, pode sair' else 'TEM DADO — PARE' end as veredito
from pg_class c
  left join pg_stat_user_tables s on s.relid = c.oid
where c.relnamespace = 'public'::regnamespace
  and c.relkind = 'r'
  and c.relname in (
    'fighters', 'fights', 'fight_round_stats', 'attribute_scores',
    'division_snapshot', 'weight_class_history', 'fighter_ratings', 'events'
  )
order by pg_total_relation_size(c.oid) desc;

-- A contagem de pg_stat pode estar velha. Esta conta de verdade, linha a linha.
select 'fighters' as tabela, count(*) as linhas_de_verdade from public.fighters
union all select 'fights', count(*) from public.fights
union all select 'fight_round_stats', count(*) from public.fight_round_stats
union all select 'attribute_scores', count(*) from public.attribute_scores
union all select 'division_snapshot', count(*) from public.division_snapshot
union all select 'weight_class_history', count(*) from public.weight_class_history
union all select 'fighter_ratings', count(*) from public.fighter_ratings
union all select 'events', count(*) from public.events
order by linhas_de_verdade desc;

-- ─── 2. Apagar. Só rode se tudo acima deu zero. ─────────────────────────────
--
-- Em cascata porque elas se referenciam entre si. Nada do AdekeIntern aponta
-- para nenhuma delas, então a cascata não alcança o escritório.

drop table if exists public.fight_round_stats cascade;
drop table if exists public.attribute_scores cascade;
drop table if exists public.fighter_ratings cascade;
drop table if exists public.weight_class_history cascade;
drop table if exists public.division_snapshot cascade;
drop table if exists public.fights cascade;
drop table if exists public.events cascade;
drop table if exists public.fighters cascade;

-- ─── 3. O que sobrou é só do escritório ─────────────────────────────────────

select
  c.relname as tabela,
  coalesce(s.n_live_tup, 0) as linhas,
  pg_size_pretty(pg_total_relation_size(c.oid)) as espaco
from pg_class c
  left join pg_stat_user_tables s on s.relid = c.oid
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc;
