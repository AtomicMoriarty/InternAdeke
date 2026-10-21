-- Fecha seed_adeke_user para quem não é o próprio sistema.
--
-- A função foi criada por fora das migrações para cadastrar usuários à mão,
-- com SECURITY DEFINER e EXECUTE liberado para todo mundo — inclusive anon,
-- quem nem fez login. Pela API, qualquer pessoa na internet podia chamá-la
-- para trocar a senha de qualquer usuário existente (o admin incluso) e
-- entrar como ele, ou criar uma conta nova já como admin.
--
-- Nenhum código do app chama esta função. Continua disponível pelo SQL Editor
-- do Supabase e pela chave de serviço, que é onde cadastro manual deve morar.

revoke execute on function public.seed_adeke_user(text, text, text, text)
  from public, anon, authenticated;

-- Função de gatilho não se chama pela API, mas também não precisa estar exposta.
revoke execute on function public.proteger_permissoes_do_perfil() from public, anon, authenticated;
