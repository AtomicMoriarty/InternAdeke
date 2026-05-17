// @ts-nocheck
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdekeDashboard from "@/components/AdekeDashboard";

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>) => ({
    cliente: (s.cliente as string) || undefined,
    modulo: (s.modulo as string) || undefined,
    plano: (s.plano as string) || undefined,
    item: (s.item as string) || undefined,
    nota: (s.nota as string) || undefined,
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [session, setSession] = useState<any>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) navigate({ to: "/auth" });
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
      if (!data.session) navigate({ to: "/auth" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  // Forward deep-link params to dashboard via window event (once data loads,
  // AdekeDashboard listens to "adeke:deeplink").
  useEffect(() => {
    if (!session || !search?.cliente) return;
    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent("adeke:deeplink", { detail: search }));
    }, 400);
    return () => clearTimeout(t);
  }, [session, search?.cliente, search?.item, search?.plano, search?.modulo]);

  if (!checked || !session) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F0F5FF", color: "#64748B" }}>Carregando...</div>;
  }

  return (
    <div style={{ position: "relative" }}>
      <Link to="/quadro" style={{
        position: "fixed", top: 16, right: 168, zIndex: 1000,
        background: "#0DD3C5", color: "#fff", border: "none", borderRadius: 8,
        padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
        fontFamily: "Outfit, sans-serif", textDecoration: "none",
        display: "inline-flex", alignItems: "center", gap: 6, boxShadow: "0 2px 6px rgba(13,211,197,0.3)",
      }}>
        <LayoutGrid size={13} /> Quadro Geral
      </Link>
      <button
        onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}
        style={{ position: "fixed", top: 16, right: 20, zIndex: 1000, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#475569", cursor: "pointer", fontFamily: "Outfit, sans-serif" }}
        title={session.user.email}
      >
        Sair
      </button>
      <AdekeDashboard />
    </div>
  );
}
