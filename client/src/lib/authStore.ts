import { create } from "zustand";
import { supabase } from "./supabase";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
}

export interface AuthOrg {
  id: string;
  name: string;
  role: "admin" | "member";
}

interface AuthState {
  user: AuthUser | null;
  org: AuthOrg | null;
  token: string | null;
  loading: boolean;
  init: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  signInDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  setOrg: (org: AuthOrg) => void;
  refreshMe: () => Promise<void>;
}

const DEMO_EMAIL = "demo@ifrs16app.com";
const DEMO_PASSWORD = "Demo1234!";

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  org: null,
  token: null,
  loading: true,

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      set({ token: session.access_token });
      await get().refreshMe();
    } else {
      set({ loading: false });
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        set({ token: session.access_token });
        await get().refreshMe();
      } else {
        set({ user: null, org: null, token: null, loading: false });
      }
    });
  },

  signInWithGoogle: async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/auth/callback" },
    });
  },

  signInWithMicrosoft: async () => {
    await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: { redirectTo: window.location.origin + "/auth/callback" },
    });
  },

  signInDemo: async () => {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    if (error) {
      set({ loading: false });
      throw error;
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, org: null, token: null });
  },

  setOrg: (org) => set({ org }),

  refreshMe: async () => {
    const { token } = get();
    if (!token) return;
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 403) {
          // Authenticated but no org yet
          const data = await res.json().catch(() => ({}));
          if (data.error === "no_org") {
            const userRes = await supabase.auth.getUser();
            const u = userRes.data.user;
            if (u) {
              set({
                user: {
                  id: u.id,
                  email: u.email ?? "",
                  name: u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.email ?? "",
                  avatar: u.user_metadata?.avatar_url ?? null,
                },
                org: null,
                loading: false,
              });
            }
          }
        }
        return;
      }
      const data = await res.json();
      set({
        user: data.user,
        org: data.org,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },
}));

export const getAuthToken = () => useAuthStore.getState().token;
