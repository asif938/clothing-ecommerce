"use client";

import { useCallback, useEffect, useState } from "react";

/** Same-tab change notice: every `useLocalList(key)` on the page re-reads when one of them writes (the `storage` event only fires in *other* tabs). */
const changeEvent = (key: string) => `local-list:${key}`;

function read(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    // Private browsing / blocked storage — the list just stays empty for this session.
    return [];
  }
}

/**
 * Guest wishlist and "recently viewed" (docs/PROJECT_SPEC.md §7.2, §7.4)
 * are deliberately client-only (localStorage) for now — "account sync"
 * needs a logged-in customer, and customer auth doesn't exist before M5.
 * Account sync is the natural follow-up once it does: read this same
 * list on login and merge it into the account's stored one. See
 * docs/DECISIONS.md.
 *
 * Every instance with the same key stays in step — a heart tapped on one
 * product card updates the PDP button and the wishlist page at once, and
 * other open tabs too.
 */
export function useLocalList(key: string, maxItems = 50) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const reload = () => setIds(read(key));
    reload();
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) reload();
    };
    window.addEventListener(changeEvent(key), reload);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(changeEvent(key), reload);
      window.removeEventListener("storage", onStorage);
    };
  }, [key]);

  const persist = useCallback(
    (next: string[]) => {
      setIds(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Ignore — nothing to persist to, but the in-memory state above still works for this page view.
      }
      window.dispatchEvent(new Event(changeEvent(key)));
    },
    [key],
  );

  // Read the stored list at write time, not this instance's copy, so two components writing in turn never undo each other.
  const add = useCallback((id: string) => persist([id, ...read(key).filter((existing) => existing !== id)].slice(0, maxItems)), [key, persist, maxItems]);
  const remove = useCallback((id: string) => persist(read(key).filter((existing) => existing !== id)), [key, persist]);
  const has = useCallback((id: string) => ids.includes(id), [ids]);
  const toggle = useCallback((id: string) => (read(key).includes(id) ? remove(id) : add(id)), [key, remove, add]);

  return { ids, add, remove, has, toggle };
}
