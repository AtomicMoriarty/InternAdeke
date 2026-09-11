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
      '#0DD3C5'
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
    '#0DD3C5'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 3) Permite que usuários logados LEIAM a lista de profiles.
--    Sem isto o picker fica vazio mesmo com os dados preenchidos, porque o RLS
--    bloqueia o SELECT.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'profiles_select_authenticated'
  ) THEN
    CREATE POLICY profiles_select_authenticated
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;


-- 4) Permite que cada pessoa edite o próprio profile (nome, cor do avatar).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'profiles_update_own'
  ) THEN
    CREATE POLICY profiles_update_own
      ON public.profiles
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;
