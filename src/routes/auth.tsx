// @ts-nocheck
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("access_enabled")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profile?.access_enabled === false) {
        await supabase.auth.signOut();
        setLoading(false);
        setErr("Seu acesso esta desativado. Fale com o administrador.");
        return;
      }
    }
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    navigate({ to: "/" });
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F0F5FF",
        fontFamily: "Outfit, sans-serif",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "#fff",
          padding: 32,
          borderRadius: 16,
          width: 360,
          boxShadow: "0 4px 30px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 900, color: "#0F172A", marginBottom: 4 }}>
          <span style={{ color: "#0DD3C5" }}>A</span>DEKE
        </div>
        <p style={{ color: "#64748B", fontSize: 12, marginBottom: 24 }}>Acesse sua conta</p>
        <label style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid #CBD5E1",
            borderRadius: 8,
            marginTop: 4,
            marginBottom: 14,
            fontSize: 13,
          }}
        />
        <label style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>Senha</label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid #CBD5E1",
            borderRadius: 8,
            marginTop: 4,
            marginBottom: 14,
            fontSize: 13,
          }}
        />
        {err && <div style={{ color: "#DC2626", fontSize: 12, marginBottom: 12 }}>{err}</div>}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "11px",
            background: "#0DD3C5",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {loading ? "Aguarde..." : "Entrar"}
        </button>
        <p style={{ color: "#94A3B8", fontSize: 11, textAlign: "center", marginTop: 12 }}>
          Acesso liberado apenas para usuarios cadastrados.
        </p>
      </form>
    </div>
  );
}
