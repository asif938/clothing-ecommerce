"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Guest wishlist and "recently viewed" (docs/PROJECT_SPEC.md §7.2, §7.4)
 * are deliberately client-only (localStorage) for now — "account sync"
 * needs a logged-in customer, and customer auth doesn't exist before M5.
 * Account sync is the natural follow-up once it does: read this same
 * list on login and merge it into the account's stored one. See
 * docs/DECISIONS.md.
 */
export function useLocalList(key: string, maxItems = 50) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage, an external system, not derivable from props/state
      setIds(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      // Private browsing / blocked storage — the list just stays empty for this session.
    }
  }, [key]);

  const persist = useCallback(
    (next: string[]) => {
      setIds(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Ignore — nothing to persist to, but the in-memory state above still works for this page view.
      }
    },
    [key],
  );

  const add = useCallback(
    (id: string) => {
      persist([id, ...ids.filter((existing) => existing !== id)].slice(0, maxItems));
    },
    [ids, persist, maxItems],
  );

  const remove = useCallback((id: string) => persist(ids.filter((existing) => existing !== id)), [ids, persist]);
  const has = useCallback((id: string) => ids.includes(id), [ids]);
  const toggle = useCallback((id: string) => (has(id) ? remove(id) : add(id)), [has, remove, add]);

  return { ids, add, remove, has, toggle };
}
