-- Tira os valores em R$ de dentro do dashboard_state.
--
-- NÃO rodar antes de o app novo estar publicado: a versão antiga lê o valor
-- do JSON, e mostraria tudo zerado. Ordem certa:
--   1. migração 20261020000100_proteger_perfis_e_valores (copia para a tabela)
--   2. publicar o app que lê de valores_negocio
--   3. este arquivo, no SQL Editor do Supabase
--
-- Fica fora de supabase/migrations de propósito, para nenhuma ferramenta
-- aplicar sozinha antes da hora.
--
-- Depois disto, o gatilho mantém o JSON limpo mesmo que uma aba antiga,
-- aberta antes da publicação, regrave o estado inteiro com valores dentro: o
-- valor dela vai para a tabela (se ainda não houver um lá) e sai do JSON.

-- Recopia o que entrou no JSON desde a migração, sem sobrescrever a tabela.
insert into public.valores_negocio (item_id, valor)
select distinct on (item ->> 'id') item ->> 'id', (item ->> 'valor')::numeric
from public.dashboard_state s,
  lateral jsonb_path_query(
    s.data,
    '$.areas[*] ? (@.id == "comercial").clientes[*].planos[*].items[*]'
  ) as item
where s.id = 'main'
  and jsonb_typeof(item -> 'id') = 'string'
  and jsonb_typeof(item -> 'valor') = 'number'
on conflict (item_id) do nothing;

create or replace function public.dashboard_sem_valores(doc jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when jsonb_typeof(doc -> 'areas') <> 'array' then doc
    else jsonb_set(doc, '{areas}', (
      select coalesce(jsonb_agg(
        case when area ->> 'id' <> 'comercial' or jsonb_typeof(area -> 'clientes') <> 'array' then area
        else jsonb_set(area, '{clientes}', (
          select coalesce(jsonb_agg(
            case when jsonb_typeof(cliente -> 'planos') <> 'array' then cliente
            else jsonb_set(cliente, '{planos}', (
              select coalesce(jsonb_agg(
                case when jsonb_typeof(plano -> 'items') <> 'array' then plano
                else jsonb_set(plano, '{items}', (
                  select coalesce(jsonb_agg(
                    -- Só sai do JSON o que está garantido na tabela. Texto que
                    -- não deu para ler ("8,5k") fica até alguém corrigir na tela.
                    case when jsonb_typeof(item) = 'object' and exists (
                      select 1 from public.valores_negocio v where v.item_id = item ->> 'id'
                    ) then item - 'valor' else item end
                    order by io), '[]'::jsonb)
                  from jsonb_array_elements(plano -> 'items') with ordinality as i(item, io)
                ))
                end order by po), '[]'::jsonb)
              from jsonb_array_elements(cliente -> 'planos') with ordinality as p(plano, po)
            ))
            end order by co), '[]'::jsonb)
          from jsonb_array_elements(area -> 'clientes') with ordinality as c(cliente, co)
        ))
        end order by ao), '[]'::jsonb)
      from jsonb_array_elements(doc -> 'areas') with ordinality as a(area, ao)
    ))
  end
$$;

create or replace function public.manter_valores_fora_do_json()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.valores_negocio (item_id, valor)
  select distinct on (item ->> 'id') item ->> 'id', (item ->> 'valor')::numeric
  from jsonb_path_query(
    new.data,
    '$.areas[*] ? (@.id == "comercial").clientes[*].planos[*].items[*]'
  ) as item
  where jsonb_typeof(item -> 'id') = 'string'
    and jsonb_typeof(item -> 'valor') = 'number'
  on conflict (item_id) do nothing;

  new.data := public.dashboard_sem_valores(new.data);
  return new;
end
$$;

drop trigger if exists manter_valores_fora_do_json on public.dashboard_state;
create trigger manter_valores_fora_do_json
  before insert or update of data on public.dashboard_state
  for each row execute function public.manter_valores_fora_do_json();

-- Dispara o gatilho uma vez, limpando o que já está lá.
update public.dashboard_state set data = data where id = 'main';
