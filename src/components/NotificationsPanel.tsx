import { useEffect, useRef, useState } from "react";
import { Bell, X, AtSign, MessageSquare, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNotifications, markAllRead, markRead, type Notification } from "@/lib/notifications";
import { useProfiles, initials, colorFor } from "@/lib/profiles";
import { MentionText } from "@/components/MentionTextarea";

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

type Props = {
  userId: string | null;
  userName: string;
  onNavigate?: (n: Notification) => void;
};

export default function NotificationsPanel({ userId, userName, onNavigate }: Props) {
  const list = useNotifications(userId);
  const [open, setOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const shownWelcomeRef = useRef(false);
  const profiles = useProfiles();

  const unread = list.filter((n) => !n.lida);

  useEffect(() => {
    if (!userId || shownWelcomeRef.current) return;
    // Show welcome modal once per session if there's anything unread
    if (list.length > 0) {
      shownWelcomeRef.current = true;
      if (unread.length > 0) setWelcomeOpen(true);
    }
  }, [userId, list.length, unread.length]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function handleClick(n: Notification) {
    markRead(n.id);
    setOpen(false);
    setWelcomeOpen(false);
    onNavigate?.(n);
  }

  return (
    <>
      <div ref={ref} style={{ position: "fixed", top: 16, right: 76, zIndex: 1001 }}>
        <button
          onClick={() => setOpen((o) => !o)}
          title="Notificações"
          style={{
            position: "relative", background: "#fff", border: "1px solid #E2E8F0",
            borderRadius: 8, padding: "6px 10px", cursor: "pointer", display: "flex",
            alignItems: "center", gap: 6, fontFamily: "Outfit, sans-serif",
          }}>
          <Bell size={15} color="#475569" />
          {unread.length > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4, background: "#EF4444", color: "#fff",
              borderRadius: 10, fontSize: 10, fontWeight: 800, padding: "1px 6px", minWidth: 18, textAlign: "center",
            }}>{unread.length}</span>
          )}
        </button>

        {open && (
          <Panel list={list} onClick={handleClick} onMarkAll={() => userId && markAllRead(userId)} />
        )}
      </div>

      {welcomeOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 2000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "Outfit, sans-serif",
        }} onClick={() => setWelcomeOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560,
            maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 11, color: "#64748B", fontWeight: 600, marginBottom: 2 }}>Bem-vindo(a) de volta</p>
                <h3 style={{ fontSize: 18, fontWeight: 900, color: "#0F172A" }}>
                  {userName}, você tem <span style={{ color: "#0DD3C5" }}>{unread.length}</span> novidade{unread.length !== 1 ? "s" : ""}
                </h3>
              </div>
              <button onClick={() => setWelcomeOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ overflow: "auto", flex: 1 }}>
              {list.slice(0, 20).map((n) => (
                <NotifRow key={n.id} n={n} onClick={() => handleClick(n)} profiles={profiles} />
              ))}
            </div>
            <div style={{ padding: 12, borderTop: "1px solid #F1F5F9", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { if (userId) markAllRead(userId); }} style={btnSecondary}>
                <Check size={13} /> Marcar todas como lidas
              </button>
              <button onClick={() => setWelcomeOpen(false)} style={btnPrimary}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Panel({ list, onClick, onMarkAll }: { list: Notification[]; onClick: (n: Notification) => void; onMarkAll: () => void }) {
  const profiles = useProfiles();
  return (
    <div style={{
      position: "absolute", top: "calc(100% + 8px)", right: 0,
      width: 380, maxHeight: 480, background: "#fff", border: "1px solid #E2E8F0",
      borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.15)", overflow: "hidden",
      display: "flex", flexDirection: "column", fontFamily: "Outfit, sans-serif",
    }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>Notificações</span>
        <button onClick={onMarkAll} style={{ background: "none", border: "none", color: "#0DD3C5", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          Marcar tudo lido
        </button>
      </div>
      <div style={{ overflow: "auto", flex: 1 }}>
        {list.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "#94A3B8", fontSize: 12 }}>Sem notificações ainda</div>
        )}
        {list.map((n) => <NotifRow key={n.id} n={n} onClick={() => onClick(n)} profiles={profiles} />)}
      </div>
    </div>
  );
}

function NotifRow({ n, onClick, profiles }: { n: Notification; onClick: () => void; profiles: any[] }) {
  const Icon = n.tipo === "mencao" ? AtSign : MessageSquare;
  const color = n.tipo === "mencao" ? "#8B5CF6" : "#0DD3C5";
  return (
    <button onClick={onClick} style={{
      display: "flex", gap: 10, padding: "12px 14px", width: "100%",
      background: n.lida ? "transparent" : "#F0FDFA", border: "none", borderBottom: "1px solid #F1F5F9",
      cursor: "pointer", textAlign: "left", fontFamily: "inherit",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: `${color}18`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}><Icon size={14} color={color} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#0F172A", fontWeight: 700, marginBottom: 2 }}>
          {n.tipo === "mencao" ? `${n.autor_nome || "Alguém"} mencionou você` : `Nova nota em "${n.item_nome || n.plano_nome}"`}
        </div>
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>
          {n.cliente_nome} · {n.modulo} · {n.plano_nome}{n.item_nome ? ` › ${n.item_nome}` : ""}
        </div>
        {n.trecho && (
          <div style={{ fontSize: 11, color: "#475569", background: "#F8FAFC", padding: "6px 8px", borderRadius: 6, borderLeft: `2px solid ${color}` }}>
            <MentionText text={n.trecho} />
          </div>
        )}
        <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>{timeAgo(n.created_at)}</div>
      </div>
      {!n.lida && <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 6 }} />}
    </button>
  );
}

const btnPrimary: any = { background: "#0DD3C5", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const btnSecondary: any = { background: "#F8FAFC", color: "#475569", border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 };
