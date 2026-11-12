"use client";

import { useEffect, useState } from "react";
import { myProfile, saveProfile, type Profile } from "../lib/account-api";

/**
 * Name, email, birthday and marketing consent (§5.5, §16 M13). Birthday
 * drives the birthday journey/bonus; the consent switches decide whether
 * the shop may send marketing broadcasts on each channel. Order updates are
 * transactional and don't depend on these.
 */
export function AccountProfileForm({ bn }: { bn: boolean }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    myProfile()
      .then(setProfile)
      .catch(() => undefined);
  }, []);

  if (!profile) return null;

  async function save() {
    if (!profile) return;
    setSaved(false);
    setError(null);
    try {
      setProfile(
        await saveProfile({
          name: profile.name || undefined,
          email: profile.email || null,
          birthday: profile.birthday || null,
          marketingConsentSms: profile.marketingConsentSms,
          marketingConsentEmail: profile.marketingConsentEmail,
          marketingConsentWhatsapp: profile.marketingConsentWhatsapp,
        }),
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  const consent = (key: "marketingConsentSms" | "marketingConsentWhatsapp" | "marketingConsentEmail", label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={profile[key]} onChange={(e) => setProfile({ ...profile, [key]: e.target.checked })} />
      {label}
    </label>
  );

  return (
    <section className="mb-6 space-y-2 rounded-theme border border-border p-4">
      <h2 className="text-sm font-semibold text-surface-foreground">{bn ? "প্রোফাইল" : "Profile"}</h2>
      <input value={profile.name ?? ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder={bn ? "নাম" : "Name"} className="w-full rounded-theme border border-border px-3 py-2 text-sm" />
      <input type="email" value={profile.email ?? ""} onChange={(e) => setProfile({ ...profile, email: e.target.value })} placeholder={bn ? "ইমেইল (ঐচ্ছিক)" : "Email (optional)"} className="w-full rounded-theme border border-border px-3 py-2 text-sm" />
      <label className="block text-xs text-surface-foreground/60">
        {bn ? "জন্মদিন (ঐচ্ছিক — জন্মদিনে উপহার পেতে)" : "Birthday (optional — for a birthday treat)"}
        <input type="date" value={profile.birthday ?? ""} onChange={(e) => setProfile({ ...profile, birthday: e.target.value || null })} className="mt-1 w-full rounded-theme border border-border px-3 py-2 text-sm" />
      </label>
      <p className="pt-2 text-xs text-surface-foreground/60">{bn ? "অফার ও নতুন কালেকশনের খবর পেতে চাই:" : "Send me offers and new arrivals by:"}</p>
      {consent("marketingConsentSms", "SMS")}
      {consent("marketingConsentWhatsapp", "WhatsApp")}
      {consent("marketingConsentEmail", bn ? "ইমেইল" : "Email")}
      <div className="flex items-center gap-3 pt-1">
        <button onClick={() => void save()} className="rounded-theme border border-brand px-4 py-2 text-sm text-brand">
          {bn ? "সংরক্ষণ করুন" : "Save"}
        </button>
        {saved && <span className="text-xs text-success">{bn ? "সংরক্ষিত" : "Saved"}</span>}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </section>
  );
}
