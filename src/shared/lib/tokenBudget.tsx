import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "./supabaseClient";

export interface TokenBudget {
  used: number;
  limit: number;
  remaining: number;
  /** Per-chat context limit (tokens) before auto-compaction kicks in. */
  contextLimit: number;
}

interface BudgetContextValue {
  budget: TokenBudget | null;
  refresh: () => void;
}

const BudgetContext = createContext<BudgetContextValue>({
  budget: null,
  refresh: () => {},
});

/**
 * One shared daily-token budget for the whole app. Fetches /api/usage on mount,
 * on auth change, and whenever a "lumi:usage" event fires (dispatched after each
 * AI call), so every <UsageBar> stays in sync from a single source of truth.
 */
export function TokenBudgetProvider({ children }: { children: ReactNode }) {
  const [budget, setBudget] = useState<TokenBudget | null>(null);

  const refresh = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setBudget(null);
        return;
      }
      const resp = await fetch("/api/usage", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const d = await resp.json();
      if (typeof d?.limit === "number") {
        const used = Number(d.used) || 0;
        setBudget({
          used,
          limit: d.limit,
          remaining:
            typeof d.remaining === "number"
              ? d.remaining
              : Math.max(0, d.limit - used),
          contextLimit: Number(d.contextLimit) || 50000,
        });
      }
    } catch {
      /* ignore - the bar just won't render */
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUsage = (e: Event) => {
      // An admin slider save carries the new limit in the event detail; reflect
      // it instantly (a refetch could read the still-cached old value and undo
      // it). A plain event (after an AI turn) just refetches used/remaining.
      const limit = (e as CustomEvent).detail?.limit;
      if (typeof limit === "number" && limit > 0) {
        setBudget((b) =>
          b ? { ...b, limit, remaining: Math.max(0, limit - b.used) } : b
        );
        return;
      }
      refresh();
    };
    window.addEventListener("lumi:usage", onUsage);
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh());
    return () => {
      window.removeEventListener("lumi:usage", onUsage);
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  return (
    <BudgetContext.Provider value={{ budget, refresh }}>
      {children}
    </BudgetContext.Provider>
  );
}

export function useTokenBudget(): BudgetContextValue {
  return useContext(BudgetContext);
}
