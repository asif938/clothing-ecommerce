"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";

interface LocationOption {
  id: string;
  code: string;
  name: { en?: string; bn?: string };
}
interface ProductVariant {
  id: string;
  sku: string;
  price: number;
}
interface ProductResult {
  id: string;
  title: { en?: string; bn?: string };
  variants: ProductVariant[];
}
interface Line {
  variantId: string;
  sku: string;
  title: string;
  price: number;
  quantity: number;
}

function money(poisha: number) {
  return `৳${(poisha / 100).toFixed(2)}`;
}

export default function NewManualOrderPage() {
  const t = useTranslations("orders");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const [channel, setChannel] = useState<"phone" | "messenger" | "whatsapp">("phone");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [divisions, setDivisions] = useState<LocationOption[]>([]);
  const [districts, setDistricts] = useState<LocationOption[]>([]);
  const [areas, setAreas] = useState<LocationOption[]>([]);
  const [divisionId, setDivisionId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [addressLine, setAddressLine] = useState("");

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductResult[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("0");
  const [paymentStatus, setPaymentStatus] = useState<"cod" | "already_paid">("cod");
  const [paidMethod, setPaidMethod] = useState<"bkash" | "nagad" | "mock">("bkash");
  const [externalRef, setExternalRef] = useState("");
  const [customerNote, setCustomerNote] = useState("");

  useEffect(() => {
    void api.get<LocationOption[]>("/store/locations/divisions").then(setDivisions);
  }, []);
  useEffect(() => {
    if (!divisionId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale lower-level options in response to the divisionId dependency itself changing, not fetched/external data.
    setDistricts([]);
    setDistrictId("");
    setAreaId("");
    void api.get<LocationOption[]>(`/store/locations/districts?divisionId=${divisionId}`).then(setDistricts);
  }, [divisionId]);
  useEffect(() => {
    if (!districtId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale lower-level options in response to the districtId dependency itself changing, not fetched/external data.
    setAreas([]);
    setAreaId("");
    void api.get<LocationOption[]>(`/store/locations/areas?districtId=${districtId}`).then(setAreas);
  }, [districtId]);

  async function searchProducts() {
    try {
      const result = await api.get<{ data: ProductResult[] }>(`/admin/products?q=${encodeURIComponent(search)}&pageSize=10`);
      setResults(result.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Search failed");
    }
  }

  function addLine(product: ProductResult, variant: ProductVariant) {
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === variant.id);
      if (existing) return prev.map((l) => (l.variantId === variant.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { variantId: variant.id, sku: variant.sku, title: product.title.en ?? product.title.bn ?? variant.sku, price: variant.price, quantity: 1 }];
    });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  async function submit() {
    setError(null);
    try {
      const order = await api.post<{ id: string }>("/admin/orders", {
        channel,
        customerPhone,
        customerName,
        divisionId,
        districtId,
        areaId,
        addressLine,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        manualDiscountAmount: Math.round(Number.parseFloat(discount || "0") * 100),
        payment: paymentStatus === "cod" ? { status: "cod" } : { status: "already_paid", method: paidMethod, externalRef: externalRef || null },
        customerNote: customerNote || null,
      });
      router.push(`/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create order");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("createManual")}</h1>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-surface-foreground">{t("customer")}</h2>
        <div className="grid grid-cols-3 gap-3">
          <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm">
            <option value="phone">{t("channel.phone")}</option>
            <option value="messenger">{t("channel.messenger")}</option>
            <option value="whatsapp">{t("channel.whatsapp")}</option>
          </select>
          <TextField label={t("customerPhone")} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          <TextField label={t("customerName")} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-surface-foreground">{t("addressAndContact")}</h2>
        <div className="grid grid-cols-3 gap-3">
          <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm">
            <option value="">{t("division")}</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>{d.name.en ?? d.name.bn}</option>
            ))}
          </select>
          <select value={districtId} onChange={(e) => setDistrictId(e.target.value)} disabled={!divisionId} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm">
            <option value="">{t("district")}</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>{d.name.en ?? d.name.bn}</option>
            ))}
          </select>
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)} disabled={!districtId} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm">
            <option value="">{t("area")}</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name.en ?? a.name.bn}</option>
            ))}
          </select>
        </div>
        <TextField label={t("addressLine")} value={addressLine} onChange={(e) => setAddressLine(e.target.value)} />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-surface-foreground">{t("items")}</h2>
        <div className="flex gap-2">
          <input className="flex-1 rounded-theme border border-border bg-surface px-3 py-2 text-sm" placeholder={t("searchProducts")} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void searchProducts()} />
          <Button onClick={() => void searchProducts()}>{t("search")}</Button>
        </div>
        {results.length > 0 && (
          <div className="flex flex-col gap-1 rounded-theme border border-border p-2">
            {results.map((p) =>
              p.variants.map((v) => (
                <button key={v.id} onClick={() => addLine(p, v)} className="flex justify-between rounded px-2 py-1 text-left text-sm hover:bg-muted">
                  <span>{p.title.en ?? p.title.bn} — {v.sku}</span>
                  <span>{money(v.price)}</span>
                </button>
              )),
            )}
          </div>
        )}
        <table className="w-full text-sm">
          <tbody>
            {lines.map((l) => (
              <tr key={l.variantId} className="border-b border-border last:border-0">
                <td className="py-2 text-surface-foreground">{l.title} ({l.sku})</td>
                <td className="py-2">
                  <input type="number" min={1} className="w-20 rounded-theme border border-border bg-surface px-2 py-1 text-sm" value={l.quantity} onChange={(e) => setLines(lines.map((x) => (x.variantId === l.variantId ? { ...x, quantity: Number(e.target.value) } : x)))} />
                </td>
                <td className="py-2 text-right text-surface-foreground">{money(l.price * l.quantity)}</td>
                <td className="py-2 text-right">
                  <button onClick={() => setLines(lines.filter((x) => x.variantId !== l.variantId))} className="text-danger">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm font-semibold text-surface-foreground">{t("subtotal")}: {money(subtotal)}</p>
        <TextField label={t("manualDiscount")} value={discount} onChange={(e) => setDiscount(e.target.value)} />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-surface-foreground">{t("payment")}</h2>
        <div className="flex gap-3">
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as typeof paymentStatus)} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm">
            <option value="cod">{t("paymentOptions.cod")}</option>
            <option value="already_paid">{t("paymentOptions.alreadyPaid")}</option>
          </select>
          {paymentStatus === "already_paid" && (
            <>
              <select value={paidMethod} onChange={(e) => setPaidMethod(e.target.value as typeof paidMethod)} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm">
                <option value="bkash">bKash</option>
                <option value="nagad">Nagad</option>
                <option value="mock">{t("paymentOptions.other")}</option>
              </select>
              <TextField label={t("trxRef")} value={externalRef} onChange={(e) => setExternalRef(e.target.value)} />
            </>
          )}
        </div>
        <TextField label={t("customerNote")} value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} />
      </Card>

      <Button onClick={() => void submit()} disabled={!customerPhone || !customerName || !areaId || !addressLine || lines.length === 0}>
        {t("placeOrder")}
      </Button>
    </div>
  );
}
