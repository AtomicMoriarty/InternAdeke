import { useRef, useState, useEffect } from "react";
import { useProfiles, initials, colorFor, type Profile } from "@/lib/profiles";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  rows?: number;
};

export default function MentionTextarea({ value, onChange, onSubmit, placeholder, rows = 2 }: Props) {
  const profiles = useProfiles();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  function check(v: string, caret: number) {
    const before = v.slice(0, caret);
    const m = before.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/);
    if (m) { setQuery(m[1]); setOpen(true); setActive(0); }
    else { setOpen(false); setQuery(""); }
  }

  const filtered = open
    ? profiles.filter((p) =>
        !query || p.username.toLowerCase().includes(query.toLowerCase()) ||
        p.display_name.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 6)
    : [];

  function pick(p: Profile) {
    const ta = ref.current!;
    const caret = ta.selectionStart || 0;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const replaced = before.replace(/@([a-zA-Z0-9._-]*)$/, `@${p.username} `);
    const next = replaced + after;
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = replaced.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  return (
    <div style={{ position: "relative", flex: 1 }}>
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); check(e.target.value, e.target.selectionStart || 0); }}
        onKeyDown={(e) => {
          if (open && filtered.length) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % filtered.length); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + filtered.length) % filtered.length); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(filtered[active]); return; }
            if (e.key === "Escape") { setOpen(false); return; }
          }
          if (!open && e.key === "Enter" && !e.shiftKey && onSubmit) { e.preventDefault(); onSubmit(); }
        }}
        style={{
          width: "100%", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8,
          padding: "8px 12px", fontSize: 12, fontFamily: "inherit", color: "#0F172A",
          resize: "vertical", outline: "none", minHeight: 36,
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 4px)", left: 0, zIndex: 1000,
          background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10,
          boxShadow: "0 8px 30px rgba(0,0,0,0.12)", minWidth: 240, maxHeight: 240, overflow: "auto",
        }}>
          {filtered.map((p, i) => (
            <button key={p.id}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              style={{
                display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "7px 10px",
                background: i === active ? "#F0FDFA" : "transparent", border: "none",
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 22, height: 22, borderRadius: "50%", background: p.avatar_color || colorFor(p.id),
                color: "#fff", fontSize: 9, fontWeight: 800,
              }}>{initials(p.display_name)}</span>
              <span style={{ fontSize: 12, color: "#0F172A", fontWeight: 600 }}>{p.display_name}</span>
              <span style={{ fontSize: 10, color: "#94A3B8", marginLeft: "auto" }}>@{p.username}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MentionText({ text }: { text: string }) {
  const profiles = useProfiles();
  const parts = text.split(/(@[a-zA-Z0-9._-]+)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          const username = part.slice(1);
          const p = profiles.find((x) => x.username.toLowerCase() === username.toLowerCase());
          if (p) {
            return (
              <span key={i} title={p.display_name} style={{
                color: p.avatar_color || colorFor(p.id), fontWeight: 700,
                background: `${p.avatar_color || colorFor(p.id)}15`,
                padding: "1px 5px", borderRadius: 4, cursor: "pointer",
              }}>@{p.username}</span>
            );
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export function extractMentions(text: string, profiles: Profile[]): Profile[] {
  const found = new Map<string, Profile>();
  const re = /@([a-zA-Z0-9._-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const p = profiles.find((x) => x.username.toLowerCase() === m![1].toLowerCase());
    if (p) found.set(p.id, p);
  }
  return Array.from(found.values());
}
