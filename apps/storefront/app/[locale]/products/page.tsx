import { permanentRedirect } from "next/navigation";

/** `/products` is a common guess for the all-products page — send it to `/shop`, keeping any search or filters. */
export default async function ProductsRedirect({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v !== undefined) query.set(key, v);
  }
  const qs = query.toString();
  permanentRedirect(`${locale === "en" ? "/en" : ""}/shop${qs ? `?${qs}` : ""}`);
}
