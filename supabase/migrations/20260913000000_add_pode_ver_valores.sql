-- Quem enxerga os valores em R$ do funil comercial.
--
-- Honorario e dado sensivel, entao o padrao e nao ver: a coluna nasce falsa e
-- so quem for liberado explicitamente passa a enxergar valor por negocio, soma
-- por coluna, ticket medio e receita potencial.
--
-- O codigo tambem libera quem tem role = 'admin', para o sistema nunca ficar
-- sem ninguem enxergando. Enquanto esta coluna nao existir, so o admin ve —
-- a ausencia nunca e interpretada como permissao.

alter table public.profiles
  add column if not exists pode_ver_valores boolean not null default false;

update public.profiles set pode_ver_valores = true where role = 'admin';

-- Para liberar um socio:
--   update public.profiles set pode_ver_valores = true where username = 'bruno.pacca';
