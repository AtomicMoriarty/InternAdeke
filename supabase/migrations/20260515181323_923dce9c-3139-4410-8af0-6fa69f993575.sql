UPDATE public.dashboard_state
SET data = jsonb_set(
  data,
  '{areas}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN a->>'id' = 'compliance' THEN jsonb_set(
          a, '{clientes}',
          (
            SELECT jsonb_agg(
              CASE
                WHEN NOT EXISTS (
                  SELECT 1 FROM jsonb_array_elements(c->'planos') p
                  WHERE p->>'name' = 'Políticas'
                )
                THEN jsonb_set(
                  c, '{planos}',
                  (c->'planos') || jsonb_build_array(jsonb_build_object(
                    'id', 'pl_pol_' || (extract(epoch from now())::bigint)::text,
                    'name', 'Políticas',
                    'responsavel', '',
                    'notas', '[]'::jsonb,
                    'items', jsonb_build_array(
                      jsonb_build_object('id','it_pol1','name','Política Anticorrupção','tipo','Documento','responsavel','','status','Não iniciado','obs','','prazo',''),
                      jsonb_build_object('id','it_pol2','name','Política de Brindes, Presentes e Hospitalidades','tipo','Documento','responsavel','','status','Não iniciado','obs','','prazo',''),
                      jsonb_build_object('id','it_pol3','name','Política de Conflito de Interesses','tipo','Documento','responsavel','','status','Não iniciado','obs','','prazo',''),
                      jsonb_build_object('id','it_pol4','name','Política de Doações e Patrocínios','tipo','Documento','responsavel','','status','Não iniciado','obs','','prazo',''),
                      jsonb_build_object('id','it_pol5','name','Política de Due Diligence de Terceiros','tipo','Documento','responsavel','','status','Não iniciado','obs','','prazo',''),
                      jsonb_build_object('id','it_pol6','name','Política de Compliance Concorrencial','tipo','Documento','responsavel','','status','Não iniciado','obs','','prazo',''),
                      jsonb_build_object('id','it_pol7','name','Política de Prevenção à Lavagem de Dinheiro','tipo','Documento','responsavel','','status','Não iniciado','obs','','prazo',''),
                      jsonb_build_object('id','it_pol8','name','Política de Consequências','tipo','Documento','responsavel','','status','Não iniciado','obs','','prazo','')
                    )
                  ))
                )
                ELSE c
              END
            )
            FROM jsonb_array_elements(a->'clientes') c
          )
        )
        ELSE a
      END
    )
    FROM jsonb_array_elements(data->'areas') a
  )
),
updated_at = now()
WHERE id = 'main';