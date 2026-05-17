
CREATE TABLE public.dashboard_state (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read dashboard" ON public.dashboard_state FOR SELECT USING (true);
CREATE POLICY "Anyone can insert dashboard" ON public.dashboard_state FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update dashboard" ON public.dashboard_state FOR UPDATE USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_state;
ALTER TABLE public.dashboard_state REPLICA IDENTITY FULL;
