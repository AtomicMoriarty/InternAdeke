-- Notificações em nome de outra pessoa, e funções internas expostas na API.
--
-- 1. A regra de inserir notificação era "with check (true)": qualquer pessoa
--    logada criava, pela API, um aviso no sino de qualquer outra, assinado com
--    o nome de quem quisesse — "Fulano atribuiu o contrato X a você". Agora o
--    autor tem de ser quem está logado. Mencionar e atribuir continuam iguais:
--    o app sempre manda o autor_id de quem fez a ação.
--
--    Os avisos do sistema (prazo) não têm autor. Eles passaram a ser gravados
--    pelo worker, com a chave de serviço, que não passa pelo RLS — antes cada
--    navegador aberto gravava os avisos de todo o escritório, em duplicata e
--    também para cards finalizados (src/lib/prazos.ts).
--
-- 2. handle_new_user e rls_auto_enable são SECURITY DEFINER e estavam
--    executáveis pela API por anon e authenticated (alerta do Supabase). São
--    funções de gatilho: não precisam de EXECUTE para disparar.

drop policy if exists "Authenticated can insert notifications" on public.notifications;
drop policy if exists "Autor insere notificação em nome próprio" on public.notifications;
create policy "Autor insere notificação em nome próprio" on public.notifications
  for insert to authenticated
  with check (autor_id = auth.uid() and public.acesso_liberado());

do $$
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    revoke execute on function public.handle_new_user() from public, anon, authenticated;
  end if;
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
