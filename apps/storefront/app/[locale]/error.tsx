"use client";

import { useEffect, useState } from "react";

interface BlockInstance {
  id: string;
  type: string;
  props: { content?: { bn?: string; en?: string } };
}

/**
 * docs/PROJECT_SPEC.md §7.3 — CMS-editable 500 content (the "500" system
 * page). Next's `error.tsx` must be a Client Component and can't `await`
 * directly, so this fetches the page content client-side (through the
 * same-origin rewrite, like the rest of the storefront's client calls)
 * rather than at the server-rendering layer the other CMS pages use —
 * the one block type in the system page is already both bn/en inline.
 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/store/pages/500")
      .then((res) => (res.ok ? res.json() : null))
      .then((page: { blocksPublished?: BlockInstance[] } | null) => {
        if (cancelled || !page) return;
        const text = page.blocksPublished?.[0]?.props.content;
        setMessage(text?.en ?? text?.bn ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-10 text-center">
      <p className="text-lg text-surface-foreground">{message ?? "Something went wrong. Please try again shortly."}</p>
      <button onClick={reset} className="rounded-theme bg-brand px-4 py-2 text-sm text-brand-foreground">
        Try again
      </button>
    </div>
  );
}
