// @ts-nocheck
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import QuadroGeral from "@/components/QuadroGeral";

export const Route = createFileRoute("/quadro")({
  validateSearch: (s: Record<string, unknown>) => ({
    modulo: (s.modulo as any) || "ambos",
    clientes: parseArr(s.clientes),
    planos: parseArr(s.planos),
    responsaveis: parseArr(s.responsaveis),
    status: parseArr(s.status),
    prazo: (s.prazo as any) || "todos",
  }),
  component: QuadroPage,
});

function parseArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  if (typeof v === "string" && v) return v.split(",").filter(Boolean);
  return [];
}

function QuadroPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [session, setSession] = useState<any>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s); if (!s) navigate({ to: "/auth" });
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session); setChecked(true);
      if (!data.session) navigate({ to: "/auth" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  if (!checked || !session) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F0F5FF", color: "#64748B" }}>Carregando...</div>;
  }

  const setFilters = (next: any) => {
    navigate({ to: "/quadro", search: { ...search, ...next } as any, replace: true });
  };

  return (
    <div>
      <div style={{
        position: "sticky", top: 0, zIndex: 200, background: "#0F172A",
        color: "#fff", padding: "12px 22px", display: "flex", alignItems: "center", gap: 14,
        fontFamily: "Outfit, sans-serif",
      }}>
        <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#fff", textDecoration: "none", fontSize: 12, fontWeight: 700, opacity: 0.9 }}>
          <ArrowLeft size={14} /> Voltar
        </Link>
        <span style={{ fontSize: 14, fontWeight: 900 }}>Quadro Geral</span>
        <span style={{ fontSize: 11, opacity: 0.7 }}>LGPD + Compliance · todos os clientes</span>
      </div>
      <QuadroGeral filters={search as any} setFilters={setFilters} />
    </div>
  );
}
