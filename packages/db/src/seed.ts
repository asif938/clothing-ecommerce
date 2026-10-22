/**
 * `pnpm db:seed` — base data only (roles, permissions, BD locations, default
 * settings, default templates). `pnpm db:seed --demo` additionally creates the
 * fictional "Demo Fashion" brand with sample catalog/content/orders.
 * See docs/PROJECT_SPEC.md §4.4.6. Implemented starting Milestone 1.
 */
const isDemo = process.argv.includes("--demo");

async function main() {
  console.log(
    isDemo
      ? "[db:seed] demo seed not implemented yet (Milestone 1+)."
      : "[db:seed] base seed not implemented yet (Milestone 1+).",
  );
}

main();
