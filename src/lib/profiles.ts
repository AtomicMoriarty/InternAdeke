import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AREA_IDS } from "@/lib/areas";

/** Por padrao a pessoa ve todos os quadros; um quadro novo entra aqui sozinho. */
export const DEFAULT_ALLOWED_MODULES = [...AREA_IDS, "produtos"];

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  username: string;
  avatar_color: string;
  role?: "admin" | "member";
  access_enabled?: boolean;
  allowed_modules?: string[];
  /** Enxerga os valores em R$ do funil comercial. Honorário é dado sensível. */
  pode_ver_valores?: boolean;
};

let cache: Profile[] | null = null;
const listeners = new Set<(p: Profile[]) => void>();
let loading: Promise<Profile[]> | null = null;

function normalizeProfile(profile: Partial<Profile>): Profile {
  return {
    id: profile.id || "",
    email: profile.email || "",
    display_name: profile.display_name || profile.username || profile.email || "Usuario",
    username: profile.username || "usuario",
    avatar_color: profile.avatar_color || colorFor(profile.id || profile.email || "usuario"),
    role: profile.role || "member",
    access_enabled: profile.access_enabled ?? true,
    allowed_modules: Array.isArray(profile.allowed_modules)
      ? profile.allowed_modules
      : DEFAULT_ALLOWED_MODULES,
    // Ausente (coluna ainda não migrada) vale como falso: nunca vazar por engano.
    pode_ver_valores: profile.pode_ver_valores === true,
  };
}

function profileFromUser(
  user: NonNullable<Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"]>,
) {
  const local = user.email?.split("@")[0] || "usuario";
  const baseUsername = local.toLowerCase().replace(/[^a-z0-9._-]/g, "") || "usuario";
  return {
    id: user.id,
    email: user.email || "",
    display_name: user.user_metadata?.display_name || user.user_metadata?.name || local,
    username: baseUsername,
    avatar_color: colorFor(user.id),
  };
}

async function load() {
  if (loading) return loading;
  loading = loadProfiles().finally(() => {
    loading = null;
  });
  return loading;
}

async function loadProfiles() {
  const { data } = await supabase.from("profiles").select("*").order("display_name");
  let profiles = ((data || []) as Profile[]).map(normalizeProfile);
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (user && !profiles.some((p) => p.id === user.id)) {
    const fallbackProfile = profileFromUser(user);
    if (profiles.some((p) => p.username === fallbackProfile.username)) {
      fallbackProfile.username = `${fallbackProfile.username}_${user.id.slice(0, 6)}`;
    }
    await supabase.from("profiles").upsert(fallbackProfile, { onConflict: "id" });
    profiles = [...profiles, fallbackProfile].sort((a, b) =>
      a.display_name.localeCompare(b.display_name),
    );
  }
  cache = profiles;
  listeners.forEach((l) => l(cache!));
  return cache;
}

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>(cache || []);
  useEffect(() => {
    listeners.add(setProfiles);
    load();
    const { data } = supabase.auth.onAuthStateChange(() => {
      cache = null;
      load();
    });
    return () => {
      listeners.delete(setProfiles);
      data.subscription.unsubscribe();
    };
  }, []);
  return profiles;
}

export function profileById(profiles: Profile[], id: string) {
  return profiles.find((p) => p.id === id);
}
export function profileByUsername(profiles: Profile[], username: string) {
  return profiles.find((p) => p.username.toLowerCase() === username.toLowerCase());
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export function colorFor(id: string) {
  const palette = [
    "#0DD3C5",
    "#3B82F6",
    "#8B5CF6",
    "#EC4899",
    "#F59E0B",
    "#10B981",
    "#F97316",
    "#06B6D4",
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
