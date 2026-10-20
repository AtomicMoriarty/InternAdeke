-- VOLTAR ATRÁS — desfaz as migrações sem perder trabalho.
--
-- Use se, depois de aplicar, alguma coisa não funcionar e você precisar do
-- sistema de pé agora. Não apaga dado: o estado volta do backup e as peças
-- novas são removidas. Rode no SQL Editor do Supabase.
--
-- Importante: se o app NOVO já estiver publicado quando você rodar isto, ele
-- volta a gravar o JSON inteiro sozinho (ele tem essa saída embutida), então
-- não é preciso despublicar junto. O que você perde é a proteção contra duas
-- pessoas se apagarem — que é como está hoje.

-- ─── 1. O estado volta ao que era antes das migrações ───────────────────────
--
-- Pule este bloco se o time trabalhou depois de aplicar: ele descarta o que
-- foi feito desde o backup. Veja primeiro o que você perderia.

select
  (select salvo_em from public.backup_antes_das_migracoes limit 1) as backup_de,
  (select updated_at from public.dashboard_state where id = 'main') as estado_mexido_em,
  case
    when (select updated_at from public.dashboard_state where id = 'main')
       > (select salvo_em from public.backup_antes_das_migracoes limit 1)
    then 'ATENÇÃO — houve trabalho depois do backup; restaurar descarta esse trabalho'
    else 'seguro — ninguém mexeu desde o backup'
  end as veredito;

-- Só rode a linha abaixo depois de ler o veredito acima.
-- update public.dashboard_state d
--   set data = b.data, updated_at = now()
--   from public.backup_antes_das_migracoes b
--  where d.id = b.id;

-- ─── 2. Tira as peças novas ─────────────────────────────────────────────────

drop trigger if exists proteger_permissoes_do_perfil on public.profiles;
drop function if exists public.proteger_permissoes_do_perfil();
drop policy if exists "Admin edita qualquer perfil" on public.profiles;

-- As policies novas saem e as antigas, permissivas, voltam — é como o sistema
-- funcionava antes, com a conferência só na tela.
drop policy if exists "Liberado lê o dashboard" on public.dashboard_state;
drop policy if exists "Liberado cria o dashboard" on public.dashboard_state;
drop policy if exists "Liberado grava o dashboard" on public.dashboard_state;

create policy "Authenticated can read dashboard"
  on public.dashboard_state for select to authenticated using (true);
create policy "Authenticated can insert dashboard"
  on public.dashboard_state for insert to authenticated with check (true);
create policy "Authenticated can update dashboard"
  on public.dashboard_state for update to authenticated using (true) with check (true);

-- A função de operações sai; o app volta sozinho a gravar o JSON inteiro.
drop function if exists public.aplicar_operacoes_dashboard(jsonb, text, text);
drop function if exists public.dashboard_aplicar_op(jsonb, jsonb, integer);
drop function if exists public.dashboard_reordenar(jsonb, jsonb);

-- ─── 3. Os valores ──────────────────────────────────────────────────────────
--
-- A tabela de valores NÃO é apagada por padrão: se o script de limpeza já
-- tiver rodado, ela é o único lugar onde os valores existem. Apagar aqui
-- perderia os honorários.

select
  (select count(*) from public.valores_negocio) as valores_na_tabela,
  (select count(*) from public.dashboard_state s,
     lateral jsonb_path_query(s.data, '$.areas[*] ? (@.id == "comercial").clientes[*].planos[*].items[*]') as item
     where s.id = 'main' and item -> 'valor' is not null
       and jsonb_typeof(item -> 'valor') <> 'null') as valores_ainda_no_json,
  case
    when (select count(*) from public.dashboard_state s,
            lateral jsonb_path_query(s.data, '$.areas[*] ? (@.id == "comercial").clientes[*].planos[*].items[*]') as item
            where s.id = 'main' and item -> 'valor' is not null
              and jsonb_typeof(item -> 'valor') <> 'null') = 0
    then 'NÃO APAGUE valores_negocio — o JSON já foi limpo e ela é o único lugar com os valores'
    else 'os valores ainda estão no JSON; dá para apagar a tabela se quiser'
  end as veredito;

-- Só se o veredito acima liberar:
-- drop table if exists public.valores_negocio cascade;
-- drop function if exists public.pode_ver_valores();
-- drop function if exists public.carimbar_valor_negocio();

-- A coluna marcas pode ficar: ela não atrapalha o app antigo e tem padrão.
-- alter table public.dashboard_state drop column if exists marcas;

-- ─── 4. Conferir que voltou ─────────────────────────────────────────────────

select
  (select count(*) from pg_proc where proname = 'aplicar_operacoes_dashboard') as funcao_de_operacoes_sumiu_se_zero,
  (select count(*) from pg_policies where tablename = 'dashboard_state') as policies_agora,
  (select count(*) from jsonb_array_elements((select data -> 'areas' from public.dashboard_state where id = 'main')) a,
     jsonb_array_elements(coalesce(a -> 'clientes', '[]'::jsonb)) v,
     jsonb_array_elements(coalesce(v -> 'planos', '[]'::jsonb)) p,
     jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) i) as cards;
