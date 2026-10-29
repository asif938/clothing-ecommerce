"use client";

/**
 * Next.js's own default `global-error` page sits above `[locale]/layout.tsx`
 * in the tree (it replaces the root layout entirely when something above
 * the locale segment itself throws) and has no access to anything that
 * layout provides. The auto-generated default crashed during static export
 * in this environment (`TypeError: Cannot read properties of null (reading
 * 'useContext')`, taking the whole build down with it — see
 * docs/DECISIONS.md); this plain, self-contained replacement renders no
 * locale-aware content and depends on nothing from `[locale]/layout.tsx`.
 */
export default function GlobalError() {
  return (
    <html lang="en">
      <body>
        <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>
          <h1>Something went wrong</h1>
          <p>Please refresh the page.</p>
        </div>
      </body>
    </html>
  );
}
