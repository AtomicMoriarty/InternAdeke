
DROP POLICY IF EXISTS "Anyone can read dashboard" ON public.dashboard_state;
DROP POLICY IF EXISTS "Anyone can insert dashboard" ON public.dashboard_state;
DROP POLICY IF EXISTS "Anyone can update dashboard" ON public.dashboard_state;

CREATE POLICY "Authenticated can read dashboard"
  ON public.dashboard_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert dashboard"
  ON public.dashboard_state FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update dashboard"
  ON public.dashboard_state FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
