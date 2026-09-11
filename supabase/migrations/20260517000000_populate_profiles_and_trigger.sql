-- ════════════════════════════════════════════════════════════════════════════
-- Faz o picker de responsáveis enxergar os usuários.
-- Seguro rodar mais de uma vez: nada é duplicado nem sobrescrito.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Cria um profile para cada usuário que já existe em auth.users.
--    O laço resolve colisão de username (ex.: heitor@a.com e heitor@b.com).
DO $$
DECLARE
  u               RECORD;
  base_username   TEXT;
  final_username  TEXT;
  n               INT;
BEGIN
  FOR u IN SELECT id, email, raw_user_meta_data FROM auth.users LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

    base_username  := split_part(u.email, '@', 1);
    final_username := base_username;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM public.profiles p WHERE p.username = final_username) LOOP
      n := n + 1;
      final_username := base_username || n::TEXT;
    END LOOP;

    INSERT INTO public.profiles (id, email, display_name, username, avatar_color)
    VALUES (
      u.id,
      u.email,
      COALESCE(NULLIF(u.raw_user_meta_data->>'display_name', ''), base_username),
      final_username,
      -- cor estavel derivada do id; a mesma paleta usada por colorFor() no app.
      -- Dar a mesma cor a todos deixaria os avatares indistinguiveis.
      (ARRAY['#0DD3C5','#3B82F6','#8B5CF6','#EC4899',
             '#F59E0B','#10B981','#F97316','#06B6D4'])[
        (('x' || substr(md5(u.id::TEXT), 1, 8))::BIT(32)::BIGINT % 8) + 1
      ]
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;


-- 2) Cria o profile automaticamente para quem se cadastrar daqui em diante.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username  TEXT;
  final_username TEXT;
  n              INT := 1;
BEGIN
  base_username  := split_part(NEW.email, '@', 1);
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles p WHERE p.username = final_username) LOOP
    n := n + 1;
    final_username := base_username || n::TEXT;
  END LOOP;

  INSERT INTO public.profiles (id, email, display_name, username, avatar_color)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), base_username),
    final_username,
    (ARRAY['#0DD3C5','#3B82F6','#8B5CF6','#EC4899',
           '#F59E0B','#10B981','#F97316','#06B6D4'])[
      (('x' || substr(md5(NEW.id::TEXT), 1, 8))::BIT(32)::BIGINT % 8) + 1
    ]
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 3) Confere se existe politica de leitura. Nao cria nada: este projeto ja tem
--    "Authenticated can read all profiles". O aviso so aparece se alguem rodar
--    isto num banco onde o RLS de fato bloquearia o picker.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND cmd IN ('SELECT', 'ALL')
      AND 'authenticated' = ANY (roles)
  ) THEN
    RAISE WARNING 'profiles nao tem politica de SELECT para authenticated: o picker ficara vazio mesmo com a tabela preenchida.';
  END IF;
END $$;
