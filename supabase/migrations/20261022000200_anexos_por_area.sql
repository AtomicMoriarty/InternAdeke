-- Anexos com a mesma permissão da área do card.
--
-- O bucket "anexos" é privado, mas as regras dele só olhavam o bucket: qualquer
-- pessoa logada — inclusive com o acesso desativado — lia e apagava qualquer
-- arquivo, de qualquer área. São contratos, atas e procurações de clientes.
--
-- O caminho passou a começar pela área (src/lib/anexos.ts: área/item/arquivo),
-- e as regras usam a mesma função das linhas de area_state. Quando a
-- migração foi escrita o bucket estava vazio, então não há arquivo no formato
-- antigo para migrar.

drop policy if exists "anexos_select" on storage.objects;
drop policy if exists "anexos_insert" on storage.objects;
drop policy if exists "anexos_delete" on storage.objects;

create policy "anexos_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'anexos'
    and public.pode_ver_modulo(public.modulo_da_linha(split_part(name, '/', 1)))
  );

create policy "anexos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'anexos'
    and public.pode_ver_modulo(public.modulo_da_linha(split_part(name, '/', 1)))
  );

create policy "anexos_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'anexos'
    and public.pode_ver_modulo(public.modulo_da_linha(split_part(name, '/', 1)))
  );
