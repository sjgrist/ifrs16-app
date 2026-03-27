import { create } from "zustand";
import { api, type Entity, type DiscountRate } from "./api";

interface AppState {
  darkMode: boolean;
  toggleDark: () => void;

  entities: Entity[];
  loadEntities: () => Promise<void>;

  rates: DiscountRate[];
  loadRates: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  darkMode: localStorage.getItem("dark") === "true",
  toggleDark: () =>
    set((s) => {
      const next = !s.darkMode;
      localStorage.setItem("dark", String(next));
      document.documentElement.classList.toggle("dark", next);
      return { darkMode: next };
    }),

  entities: [],
  loadEntities: async () => {
    const entities = await api.entities.list();
    set({ entities });
  },

  rates: [],
  loadRates: async () => {
    const rates = await api.rates.list();
    set({ rates });
  },
}));
