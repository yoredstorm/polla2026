import { create } from "zustand";
import type { BetCreate } from "@/types/api";

interface BettingState {
  pendingBet: Partial<BetCreate> | null;
  setPendingBet: (bet: Partial<BetCreate> | null) => void;
}

export const useBettingStore = create<BettingState>((set) => ({
  pendingBet: null,
  setPendingBet: (pendingBet) => set({ pendingBet }),
}));
