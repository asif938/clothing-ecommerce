"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../components/ui";

interface SearchSynonym {
  id: string;
  term: string;
  synonyms: string[];
}

export default function SearchSettingsPage() {
  const t = useTranslations("search");
  const tCommon = useTranslations("common");
  const [synonyms, setSynonyms] = useState<SearchSynonym[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [synonymsText, setSynonymsText] = useState("");

  async function load() {
    try {
      setSynonyms(await api.get<SearchSynonym[]>("/admin/search/synonyms"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load synonyms");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  async function handleCreate() {
    try {
      await api.post("/admin/search/synonyms", { term, synonyms: synonymsText.split(",").map((s) => s.trim()).filter(Boolean) });
      setTerm("");
      setSynonymsText("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add synonym");
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/admin/search/synonyms/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("synonymsTitle")}</h2>
        <ul className="flex flex-col gap-1">
          {synonyms.map((synonym) => (
            <li key={synonym.id} className="flex items-center justify-between rounded-theme border border-border px-3 py-2 text-sm">
              <span>
                {synonym.term} = {synonym.synonyms.join(", ")}
              </span>
              <button onClick={() => void handleDelete(synonym.id)} className="text-xs text-danger">
                {tCommon("delete")}
              </button>
            </li>
          ))}
          {synonyms.length === 0 && <li className="text-sm text-surface-foreground/50">—</li>}
        </ul>
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <TextField label={t("term")} placeholder="panjabi" value={term} onChange={(e) => setTerm(e.target.value)} />
          <TextField label={t("synonyms")} placeholder="punjabi, পাঞ্জাবি" value={synonymsText} onChange={(e) => setSynonymsText(e.target.value)} />
          <Button onClick={() => void handleCreate()} disabled={!term}>
            {t("add")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
