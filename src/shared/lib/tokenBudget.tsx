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
        });
      }
    } catch {
      /* ignore - the bar just won't render */
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUsage = () => refresh();
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
