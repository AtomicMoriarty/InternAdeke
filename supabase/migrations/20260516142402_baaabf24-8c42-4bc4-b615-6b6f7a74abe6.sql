-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  avatar_color TEXT NOT NULL DEFAULT '#0DD3C5',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read all profiles"
ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  local_part TEXT;
  base_username TEXT;
  final_username TEXT;
  counter INT := 0;
BEGIN
  local_part := split_part(NEW.email, '@', 1);
  base_username := lower(regexp_replace(local_part, '[^a-zA-Z0-9._-]', '', 'g'));
  IF base_username = '' THEN base_username := 'user'; END IF;
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := base_username || counter::TEXT;
  END LOOP;
  INSERT INTO public.profiles (id, email, display_name, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', initcap(replace(local_part, '.', ' '))),
    final_username
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('mencao', 'nota_responsavel')),
  cliente_id TEXT NOT NULL,
  cliente_nome TEXT NOT NULL,
  modulo TEXT NOT NULL,
  plano_id TEXT NOT NULL,
  plano_nome TEXT NOT NULL,
  item_id TEXT,
  item_nome TEXT,
  trecho TEXT,
  autor_id UUID,
  autor_nome TEXT,
  lida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, lida, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications"
ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Authenticated can insert notifications"
ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users update own notifications"
ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users delete own notifications"
ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;