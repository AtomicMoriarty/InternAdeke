-- Gravar o dashboard_state por operações, e não mais o JSON inteiro.
--
-- Antes, cada edição reenviava o estado todo (~470KB) e quem gravava por último
-- apagava o que os outros tinham gravado no meio. Agora o navegador manda só o
-- que mudou — "troque o nome do item X" — e esta função aplica em cima da
-- versão que está no banco, com a linha travada. Duas pessoas mexendo em cards
-- diferentes no mesmo segundo ficam as duas gravadas.
--
-- O espelho em TypeScript é src/lib/sincronizacao.ts. As duas implementações
-- precisam dar o mesmo resultado para a mesma operação.
--
-- Formato de uma operação:
--   {"op": "set",    "caminho": [...], "valor": <json>}
--   {"op": "remove", "caminho": [...]}
--   {"op": "ordem",  "caminho": [...], "ids": ["a", "b"]}
-- Cada passo do caminho é uma chave ("areas") ou um elemento de lista pelo id
-- ({"id": "c1"}). Caminho que não existe mais faz a operação ser ignorada.
--
-- Nada aqui quebra a versão publicada do app: ela continua gravando o JSON
-- inteiro pela tabela, e as colunas novas têm valor padrão.

-- Quem gravou: o navegador manda uma marca por lote e a vê voltar pelo tempo
-- real. É assim que ele sabe se a versão que chegou já inclui o seu lote.
alter table public.dashboard_state
  add column if not exists marcas jsonb not null default '[]'::jsonb;

create or replace function public.dashboard_reordenar(lista jsonb, ids jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(lista) <> 'array' then lista
    else coalesce((
      select jsonb_agg(e.el order by
        case when p.pos is null then 1 else 0 end,
        p.pos,
        e.ord)
      from jsonb_array_elements(lista) with ordinality as e(el, ord)
      left join jsonb_array_elements(ids) with ordinality as p(id, pos)
        on jsonb_typeof(e.el) = 'object' and e.el -> 'id' = p.id
    ), '[]'::jsonb)
  end
$$;

create or replace function public.dashboard_aplicar_op(no jsonb, op jsonb, i integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  caminho jsonb := op -> 'caminho';
  tipo text := op ->> 'op';
  total integer := jsonb_array_length(op -> 'caminho');
  passo jsonb;
  ultimo boolean;
  chave text;
  idx integer;
  filho jsonb;
begin
  if i = total then
    if tipo = 'set' then return op -> 'valor'; end if;
    if tipo = 'ordem' then return public.dashboard_reordenar(no, op -> 'ids'); end if;
    return no;
  end if;

  passo := caminho -> i;
  ultimo := i = total - 1;

  if jsonb_typeof(passo) = 'string' then
    if no is null or jsonb_typeof(no) <> 'object' then return no; end if;
    chave := passo #>> '{}';
    if ultimo and tipo = 'remove' then return no - chave; end if;
    if ultimo and tipo = 'set' then
      return no || jsonb_build_object(chave, op -> 'valor');
    end if;
    if not (no ? chave) then return no; end if;
    filho := public.dashboard_aplicar_op(no -> chave, op, i + 1);
    return jsonb_set(no, array[chave], filho);
  end if;

  -- Passo {"id": "..."}: o elemento da lista com esse id.
  if no is null or jsonb_typeof(no) <> 'array' then return no; end if;
  select (e.ord - 1)::integer into idx
  from jsonb_array_elements(no) with ordinality as e(el, ord)
  where jsonb_typeof(e.el) = 'object' and e.el -> 'id' = passo -> 'id'
  limit 1;

  if ultimo and tipo = 'remove' then
    if idx is null then return no; end if;
    return no - idx;
  end if;
  if ultimo and tipo = 'set' then
    if idx is null then return no || jsonb_build_array(op -> 'valor'); end if;
    return jsonb_set(no, array[idx::text], op -> 'valor');
  end if;
  if idx is null then return no; end if;
  filho := public.dashboard_aplicar_op(no -> idx, op, i + 1);
  return jsonb_set(no, array[idx::text], filho);
end
$$;

-- Aplica um lote de operações. security invoker: vale a mesma RLS de quem chama,
-- então só usuário logado consegue, como já era com a tabela.
create or replace function public.aplicar_operacoes_dashboard(
  p_ops jsonb,
  p_marca text default null,
  p_id text default 'main'
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_data jsonb;
  v_marcas jsonb;
  v_op jsonb;
  v_agora timestamptz := clock_timestamp();
begin
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then
    raise exception 'p_ops precisa ser uma lista de operações';
  end if;

  select data, marcas into v_data, v_marcas
  from public.dashboard_state
  where id = p_id
  for update;
  if not found then
    raise exception 'dashboard_state % não existe ou não é visível', p_id;
  end if;

  for v_op in select value from jsonb_array_elements(p_ops) loop
    if v_op ->> 'op' not in ('set', 'remove', 'ordem')
       or jsonb_typeof(v_op -> 'caminho') <> 'array' then
      raise exception 'operação inválida: %', v_op;
    end if;
    -- Apagar a raiz inteira não é edição, é acidente.
    if jsonb_array_length(v_op -> 'caminho') = 0 and v_op ->> 'op' <> 'set' then
      continue;
    end if;
    v_data := public.dashboard_aplicar_op(v_data, v_op, 0);
  end loop;

  -- Guarda as últimas 200 marcas: o bastante para cobrir quem está com
  -- gravação em voo, sem a coluna crescer para sempre.
  if p_marca is not null then
    select coalesce(jsonb_agg(m.value order by m.ord), '[]'::jsonb) into v_marcas
    from (
      select value, ord
      from jsonb_array_elements(coalesce(v_marcas, '[]'::jsonb) || to_jsonb(p_marca))
        with ordinality as t(value, ord)
      order by ord desc
      limit 200
    ) as m;
  end if;

  update public.dashboard_state
  set data = v_data, marcas = v_marcas, updated_at = v_agora
  where id = p_id;

  return v_agora;
end
$$;

revoke all on function public.aplicar_operacoes_dashboard(jsonb, text, text) from public, anon;
grant execute on function public.aplicar_operacoes_dashboard(jsonb, text, text)
  to authenticated, service_role;
