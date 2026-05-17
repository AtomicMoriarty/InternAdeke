import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useCurrentUser() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ id: data.user.id, email: data.user.email || "" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ? { id: s.user.id, email: s.user.email || "" } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return user;
}
