import { useEffect, useRef, useState } from "react";
import { Users, Check, X } from "lucide-react";
import { useProfiles, initials, colorFor, type Profile } from "@/lib/profiles";

type Props = {
  value: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
  label?: string;
};

export default function ResponsaveisPicker({ value, onChange, compact, label = "Responsáveis" }: Props) {
  const profiles = useProfiles();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ids = Array.isArray(value) ? value : [];

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = ids.map((id) => profiles.find((p) => p.id === id)).filter(Boolean) as Profile[];

  function toggle(id: string) {
    if (ids.includes(id)) onChange(ids.filter((x) => x !== id));
    else onChange([...ids, id]);
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: compact ? "5px 9px" : "7px 11px",
          borderRadius: 8, border: "1px dashed #CBD5E1", background: "#F8FAFC",
          color: "#475569", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}
        title={label}
      >
        <Users size={12} />
        {selected.length === 0 ? (
          <span>{label}</span>
        ) : (
          <span style={{ display: "inline-flex", gap: -4 }}>
            {selected.slice(0, 4).map((p, i) => (
              <span key={p.id} title={p.display_name} style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 20, height: 20, borderRadius: "50%", background: p.avatar_color || colorFor(p.id),
                color: "#fff", fontSize: 9, fontWeight: 800, marginLeft: i === 0 ? 0 : -6,
                border: "1.5px solid #fff",
              }}>{initials(p.display_name)}</span>
            ))}
            {selected.length > 4 && (
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 20, height: 20, borderRadius: "50%", background: "#64748B",
                color: "#fff", fontSize: 9, fontWeight: 800, marginLeft: -6, border: "1.5px solid #fff",
              }}>+{selected.length - 4}</span>
            )}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 1000,
          background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10,
          boxShadow: "0 8px 30px rgba(0,0,0,0.12)", minWidth: 240, maxHeight: 320, overflow: "auto",
          padding: 4,
        }}>
          {profiles.length === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: "#94A3B8" }}>Sem usuários cadastrados</div>
          )}
          {profiles.map((p) => {
            const on = ids.includes(p.id);
            return (
              <button key={p.id} onClick={() => toggle(p.id)} style={{
                display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 10px",
                background: on ? "#F0FDFA" : "transparent", border: "none", borderRadius: 6,
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 26, height: 26, borderRadius: "50%", background: p.avatar_color || colorFor(p.id),
                  color: "#fff", fontSize: 10, fontWeight: 800, flexShrink: 0,
                }}>{initials(p.display_name)}</span>
                <span style={{ flex: 1, fontSize: 12, color: "#0F172A", fontWeight: 600 }}>
                  {p.display_name}
                  <span style={{ display: "block", color: "#94A3B8", fontSize: 10, fontWeight: 500 }}>@{p.username}</span>
                </span>
                {on && <Check size={14} color="#0DD3C5" />}
              </button>
            );
          })}
          {ids.length > 0 && (
            <button onClick={() => onChange([])} style={{
              display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "8px 10px",
              background: "transparent", border: "none", borderTop: "1px solid #F1F5F9",
              color: "#94A3B8", fontSize: 11, cursor: "pointer", fontFamily: "inherit", marginTop: 4,
            }}>
              <X size={12} /> Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  );
}
