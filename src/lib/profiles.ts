import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  username: string;
  avatar_color: string;
};

let cache: Profile[] | null = null;
let listeners = new Set<(p: Profile[]) => void>();

async function load() {
  const { data } = await supabase.from("profiles").select("*").order("display_name");
  cache = (data || []) as Profile[];
  listeners.forEach((l) => l(cache!));
  return cache;
}

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>(cache || []);
  useEffect(() => {
    listeners.add(setProfiles);
    if (!cache) load();
    else setProfiles(cache);
    return () => { listeners.delete(setProfiles); };
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
  return name.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
}

export function colorFor(id: string) {
  const palette = ["#0DD3C5", "#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#F97316", "#06B6D4"];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
