-- Fecha o dashboard_state: a partir daqui, o isolamento por área vale.
--
-- NÃO rodar antes de o app novo estar publicado: a versão antiga lê o
-- dashboard_state, e ficaria sem dados. Ordem certa:
--   1. migração 20261022000100_estado_por_area (cria area_state e copia)
--   2. publicar o app que lê de area_state
--   3. pedir para todo mundo recarregar a página (abas antigas ainda leem o JSON)
--   4. este arquivo, no SQL Editor do Supabase
--
-- Fica fora de supabase/migrations de propósito, para nenhuma ferramenta
-- aplicar sozinha antes da hora.
--
-- O dashboard_state não é apagado: fica como cópia de segurança do dia em que
-- o espelho foi desligado, legível só pela chave de serviço.

-- 1. Para de copiar as gravações para o JSON único.
create or replace function public.espelho_legado_ativo()
returns boolean
language sql
immutable
set search_path = ''
as $$ select false $$;

-- 2. Ninguém logado lê nem grava mais o dashboard_state. Sem isto, a linha
--    única continuaria entregando todas as áreas a qualquer pessoa.
drop policy if exists "Liberado lê o dashboard" on public.dashboard_state;
drop policy if exists "Liberado grava o dashboard" on public.dashboard_state;
drop policy if exists "Liberado cria o dashboard" on public.dashboard_state;
revoke all on public.dashboard_state from anon, authenticated;

-- 3. O tempo real do JSON único não tem mais quem ouvir.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dashboard_state'
  ) then
    alter publication supabase_realtime drop table public.dashboard_state;
  end if;
end
$$;

-- Conferência: deve listar as linhas de area_state e mostrar que o
-- dashboard_state não tem mais política para usuários.
select id, pg_column_size(data) as bytes, updated_at from public.area_state order by ordem, id;
select count(*) as politicas_no_dashboard_state
from pg_policies where schemaname = 'public' and tablename = 'dashboard_state';
