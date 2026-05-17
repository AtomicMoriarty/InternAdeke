// Shared hook for reading + subscribing to dashboard_state, mirroring AdekeDashboard.
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const ROW_ID = "main";

export function useDashboardState() {
  const [data, setDataState] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const dataRef = useRef<any>(null);
  const lastSentRef = useRef("");
  const pendingRef = useRef(false);
  const saveTimer = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: row } = await supabase.from("dashboard_state").select("data").eq("id", ROW_ID).maybeSingle();
      if (!mounted) return;
      if (row?.data) {
        dataRef.current = row.data;
        lastSentRef.current = JSON.stringify(row.data);
        setDataState(row.data);
      }
      setLoaded(true);
    })();
    const ch = supabase.channel("dashboard_state_quadro")
      .on("postgres_changes", { event: "*", schema: "public", table: "dashboard_state", filter: `id=eq.${ROW_ID}` },
        (payload: any) => {
          const newData = payload.new?.data;
          if (!newData) return;
          const newJson = JSON.stringify(newData);
          if (newJson === lastSentRef.current) return;
          if (pendingRef.current) return;
          dataRef.current = newData;
          lastSentRef.current = newJson;
          setDataState(newData);
        }).subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, []);

  const update = useCallback((updater: (prev: any) => any) => {
    setDataState((prev: any) => {
      const next = updater(prev);
      dataRef.current = next;
      pendingRef.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const snap = dataRef.current;
        const snapJson = JSON.stringify(snap);
        lastSentRef.current = snapJson;
        await supabase.from("dashboard_state").update({ data: snap, updated_at: new Date().toISOString() }).eq("id", ROW_ID);
        if (JSON.stringify(dataRef.current) === snapJson) pendingRef.current = false;
      }, 500);
      return next;
    });
  }, []);

  return { data, loaded, update };
}
