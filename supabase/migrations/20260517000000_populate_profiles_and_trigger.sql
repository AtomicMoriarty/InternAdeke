-- Populate profiles for existing auth.users without a profile record
INSERT INTO public.profiles (id, email, display_name, username, avatar_color)
SELECT
  u.id, u.email,
  COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email,'@',1)),
  split_part(u.email,'@',1),
  '#0DD3C5'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- Auto-populate profiles for future sign-ups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, username, avatar_color)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)),
    split_part(NEW.email,'@',1),
    '#0DD3C5'
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
