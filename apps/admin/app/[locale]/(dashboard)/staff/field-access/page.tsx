"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { Banner, Card } from "../../../../../components/ui";

interface Permission {
  key: string;
  group: string;
  label: { bn?: string; en?: string };
}
interface Role {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: { permission: string }[];
}

/** Permissions that gate a single field rather than a module - the "field-level permissions UI" (docs/PROJECT_SPEC.md §8.2 Staff & security, §16 M11). It is a focused view of the same role matrix: every cell here is just a permission on a role. */
const FIELD_PERMISSION_KEYS = ["fields.customer_phone.read", "fields.order_cost.read", "catalog.cost.read"];

export default function FieldAccessPage() {
  const t = useTranslations("fieldAccess");
  const locale = useLocale() as "bn" | "en";
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [enforced, setEnforced] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [permissionRows, roleRows, settings] = await Promise.all([
        api.get<Permission[]>("/admin/permissions"),
        api.get<Role[]>("/admin/roles"),
        api.get<{ settings: { key: string; value: unknown }[] }>("/admin/settings").catch(() => ({ settings: [] as { key: string; value: unknown }[] })),
      ]);
      setPermissions(permissionRows.filter((p) => FIELD_PERMISSION_KEYS.includes(p.key)));
      setRoles(roleRows);
      const flag = settings.settings.find((s) => s.key === "security.fieldMasking.enabled");
      setEnforced(flag ? Boolean(flag.value) : null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load roles");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount.
    void load();
  }, [load]);

  async function toggle(role: Role, permission: string, grant: boolean) {
    setError(null);
    setSaving(`${role.id}:${permission}`);
    try {
      const current = role.permissions.map((p) => p.permission);
      const next = grant ? [...new Set([...current, permission])] : current.filter((p) => p !== permission);
      await api.patch(`/admin/roles/${role.id}`, { permissions: next });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update role");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {enforced === false && <Banner kind="warning">{t("notEnforced")}</Banner>}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-surface-foreground/60">
              <th className="px-4 py-3">{t("role")}</th>
              {permissions.map((p) => (
                <th key={p.key} className="px-4 py-3">
                  {p.label[locale] ?? p.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-surface-foreground">
                  {role.name}
                  {role.isSystem && <span className="ml-2 text-xs text-surface-foreground/50">({t("system")})</span>}
                </td>
                {permissions.map((p) => {
                  const granted = role.permissions.some((rp) => rp.permission === p.key);
                  return (
                    <td key={p.key} className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={granted}
                        disabled={role.isSystem || saving === `${role.id}:${p.key}`}
                        onChange={(e) => void toggle(role, p.key, e.target.checked)}
                        aria-label={`${role.name} - ${p.label[locale] ?? p.key}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-surface-foreground/60">{t("hint")}</p>
    </div>
  );
}
