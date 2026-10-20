-- ANTES DE APLICAR AS MIGRAÇÕES — conferências que não mudam nada.
--
-- Tudo aqui é leitura, menos o primeiro bloco, que faz um backup. Cole no SQL
-- Editor do Supabase e rode de uma vez. O que interessa está nos nomes das
-- colunas de resposta: cada consulta diz, em português, o que esperar.
--
-- O motivo de existir: a migração de permissões derruba policies PELO NOME.
-- As policies de produção foram criadas à mão, fora das migrações, e podem ter
-- outros nomes. Policies de RLS somam entre si — se a antiga, permissiva,
-- sobreviver, a nova entra ao lado dela e não restringe nada. Não dá erro,
-- não aparece no log, e a correção de segurança simplesmente não vale.

-- ─── 1. Backup. É o que permite voltar atrás. ───────────────────────────────

drop table if exists public.backup_antes_das_migracoes;
create table public.backup_antes_das_migracoes as
  select *, now() as salvo_em from public.dashboard_state;

select
  count(*) as linhas_salvas,
  pg_size_pretty(sum(pg_column_size(data))::bigint) as tamanho
from public.backup_antes_das_migracoes;

-- ─── 2. A CONFERÊNCIA CRÍTICA: os nomes reais das policies ──────────────────
--
-- A migração tenta derrubar, em dashboard_state:
--     "Authenticated can read dashboard"
--     "Authenticated can insert dashboard"
--     "Authenticated can update dashboard"
-- Se os nomes abaixo forem OUTROS, a migração não derruba nada e a proteção
-- não passa a valer. Nesse caso: anote os nomes de verdade e me mande, que eu
-- acerto a migração antes de aplicar.

select
  tablename as tabela,
  policyname as nome_da_policy,
  cmd as operacao,
  roles::text as para_quem,
  qual as condicao_de_leitura,
  with_check as condicao_de_escrita
from pg_policies
where schemaname = 'public'
  and tablename in ('dashboard_state', 'profiles', 'notifications')
order by tabela, operacao, nome_da_policy;

-- Resumo: quantas policies cada tabela tem hoje, e se o RLS está ligado.
select
  c.relname as tabela,
  c.relrowsecurity as rls_ligado,
  count(p.policyname) as quantas_policies
from pg_class c
  left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('dashboard_state', 'profiles', 'notifications')
group by c.relname, c.relrowsecurity
order by c.relname;

-- ─── 3. As colunas de permissão existem mesmo? ──────────────────────────────
--
-- A migração foi escrita para funcionar com ou sem cada uma. Isto é só para
-- sabermos com o que estamos lidando.

select
  column_name as coluna,
  data_type as tipo,
  column_default as padrao,
  is_nullable as aceita_nulo
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

-- Quem é admin hoje, e quem pode ver valores. Se vier zero admin, pare:
-- depois da migração só um admin consegue liberar os outros, e a saída de
-- emergência é o e-mail portoepacca@portoepacca.com, que a migração trata.
select
  display_name as pessoa,
  email,
  to_jsonb(p) ->> 'role' as papel,
  to_jsonb(p) ->> 'access_enabled' as acesso_liberado,
  to_jsonb(p) ->> 'pode_ver_valores' as ve_valores
from public.profiles p
order by display_name;

-- ─── 4. Ensaio da cópia dos valores, sem copiar nada ────────────────────────
--
-- A migração copia os valores do comercial para uma tabela. O que ela não
-- conseguir ler fica de fora e continua só no JSON. Aqui vemos quantos são, e
-- quais, ANTES de rodar — para ninguém descobrir depois que um honorário
-- sumiu da conta.

with itens as (
  select
    item ->> 'id' as item_id,
    item ->> 'name' as nome,
    item -> 'valor' as valor_cru,
    jsonb_typeof(item -> 'valor') as tipo
  from public.dashboard_state s,
    lateral jsonb_path_query(
      s.data,
      '$.areas[*] ? (@.id == "comercial").clientes[*].planos[*].items[*]'
    ) as item
  where s.id = 'main' and jsonb_typeof(item -> 'id') = 'string'
)
select
  count(*) filter (where valor_cru is not null and tipo <> 'null') as tem_valor,
  count(*) filter (
    where tipo = 'number'
       or (valor_cru #>> '{}') ~ '^\s*(R\$)?\s*[0-9][0-9.]*(,[0-9]+)?\s*$'
  ) as a_copia_entende,
  count(*) filter (
    where valor_cru is not null and tipo <> 'null'
      and tipo <> 'number'
      and (valor_cru #>> '{}') !~ '^\s*(R\$)?\s*[0-9][0-9.]*(,[0-9]+)?\s*$'
  ) as a_copia_NAO_entende
from itens;

-- E quais são os que ela não entende. Se vier vazio, ótimo. Se vier alguma
-- linha, o valor daquele negócio não vai para a tabela protegida — ele fica no
-- JSON, e depois do script de limpeza seria perdido. Me mande a lista.
with itens as (
  select
    item ->> 'id' as item_id,
    item ->> 'name' as nome,
    item -> 'valor' as valor_cru,
    jsonb_typeof(item -> 'valor') as tipo
  from public.dashboard_state s,
    lateral jsonb_path_query(
      s.data,
      '$.areas[*] ? (@.id == "comercial").clientes[*].planos[*].items[*]'
    ) as item
  where s.id = 'main' and jsonb_typeof(item -> 'id') = 'string'
)
select item_id, nome, valor_cru::text as valor_como_esta, tipo
from itens
where valor_cru is not null and tipo <> 'null'
  and tipo <> 'number'
  and (valor_cru #>> '{}') !~ '^\s*(R\$)?\s*[0-9][0-9.]*(,[0-9]+)?\s*$'
order by nome;

-- ─── 5. Retrato de antes, para comparar depois ──────────────────────────────

select
  (select count(*) from public.dashboard_state) as linhas_de_estado,
  pg_size_pretty(pg_column_size((select data from public.dashboard_state where id = 'main'))::bigint) as tamanho_do_estado,
  (select count(*) from public.profiles) as perfis,
  (select count(*) from jsonb_array_elements((select data -> 'areas' from public.dashboard_state where id = 'main')) a,
     jsonb_array_elements(coalesce(a -> 'clientes', '[]'::jsonb)) v,
     jsonb_array_elements(coalesce(v -> 'planos', '[]'::jsonb)) p,
     jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) i) as cards,
  (select count(*) from jsonb_array_elements(coalesce((select data -> 'clientes' from public.dashboard_state where id = 'main'), '[]'::jsonb))) as clientes_no_diretorio,
  (select exists (select 1 from pg_proc where proname = 'aplicar_operacoes_dashboard')) as funcao_de_operacoes_ja_existe,
  (select exists (select 1 from pg_class where relname = 'valores_negocio')) as tabela_de_valores_ja_existe;
