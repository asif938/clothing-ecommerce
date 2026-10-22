"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { useCurrentStaff } from "../../../../lib/use-current-staff";
import { Banner, Button, Card, TextField } from "../../../../components/ui";

interface Permission {
  key: string;
  group: string;
  label: { bn?: string; en?: string };
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: { permission: string }[];
}

interface StaffUser {
  id: string;
  name: string;
  email: string;
  status: "active" | "disabled";
  totpEnabled: boolean;
  roles: { role: Role }[];
}

function RolesPanel({ permissions, roles, onChanged }: { permissions: Permission[]; roles: Role[]; onChanged: () => void }) {
  const t = useTranslations("staff");
  const tCommon = useTranslations("common");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const byGroup = new Map<string, Permission[]>();
    for (const permission of permissions) {
      byGroup.set(permission.group, [...(byGroup.get(permission.group) ?? []), permission]);
    }
    return byGroup;
  }, [permissions]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleCreate() {
    setError(null);
    try {
      await api.post("/admin/roles", { name, permissions: [...selected] });
      setCreating(false);
      setName("");
      setSelected(new Set());
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create role");
    }
  }

  async function handleDelete(roleId: string) {
    try {
      await api.delete(`/admin/roles/${roleId}`);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete role");
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("rolesTitle")}</h2>
        <Button variant="secondary" onClick={() => setCreating((v) => !v)}>
          {t("createRole")}
        </Button>
      </div>
      {error && (
        <div className="mt-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}
      <ul className="mt-4 flex flex-col gap-2">
        {roles.map((role) => (
          <li key={role.id} className="flex items-center justify-between rounded-theme border border-border px-3 py-2">
            <div>
              <div className="text-sm font-medium text-surface-foreground">{role.name}</div>
              <div className="text-xs text-surface-foreground/60">{role.permissions.length} {t("permissions")}</div>
            </div>
            {!role.isSystem && (
              <button onClick={() => handleDelete(role.id)} className="text-xs text-danger">
                {tCommon("delete")}
              </button>
            )}
          </li>
        ))}
      </ul>

      {creating && (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-col gap-3">
            {[...grouped.entries()].map(([group, items]) => (
              <div key={group}>
                <div className="mb-1 text-xs font-semibold uppercase text-surface-foreground/50">{group}</div>
                <div className="flex flex-col gap-1">
                  {items.map((permission) => (
                    <label key={permission.key} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={selected.has(permission.key)} onChange={() => toggle(permission.key)} />
                      {permission.label.en ?? permission.key}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Button onClick={handleCreate}>{tCommon("create")}</Button>
        </div>
      )}
    </Card>
  );
}

function StaffPanel({ staffUsers, roles, onChanged }: { staffUsers: StaffUser[]; roles: Role[]; onChanged: () => void }) {
  const t = useTranslations("staff");
  const tCommon = useTranslations("common");
  const { staff: currentStaff } = useCurrentStaff();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    try {
      await api.post("/admin/staff", { name, email, password, roleIds: [...roleIds] });
      setCreating(false);
      setName("");
      setEmail("");
      setPassword("");
      setRoleIds(new Set());
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create staff user");
    }
  }

  async function toggleStatus(user: StaffUser) {
    try {
      await api.patch(`/admin/staff/${user.id}`, { status: user.status === "active" ? "disabled" : "active" });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update staff user");
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("title")}</h2>
        <Button variant="secondary" onClick={() => setCreating((v) => !v)}>
          {t("createStaff")}
        </Button>
      </div>
      {error && (
        <div className="mt-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}
      <ul className="mt-4 flex flex-col gap-2">
        {staffUsers.map((user) => (
          <li key={user.id} className="flex items-center justify-between rounded-theme border border-border px-3 py-2">
            <div>
              <div className="text-sm font-medium text-surface-foreground">
                {user.name} <span className="text-surface-foreground/50">({user.email})</span>
              </div>
              <div className="text-xs text-surface-foreground/60">
                {user.roles.map((r) => r.role.name).join(", ") || "—"} · {user.totpEnabled ? "2FA on" : "2FA off"}
              </div>
            </div>
            {user.id !== currentStaff?.id && (
              <button onClick={() => toggleStatus(user)} className="text-xs text-surface-foreground/70">
                {user.status === "active" ? t("statusActive") : t("statusDisabled")}
              </button>
            )}
          </li>
        ))}
      </ul>

      {creating && (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} />
          <div className="flex flex-col gap-1">
            {roles.map((role) => (
              <label key={role.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={roleIds.has(role.id)}
                  onChange={() =>
                    setRoleIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(role.id)) next.delete(role.id);
                      else next.add(role.id);
                      return next;
                    })
                  }
                />
                {role.name}
              </label>
            ))}
          </div>
          <Button onClick={handleCreate}>{tCommon("create")}</Button>
        </div>
      )}
    </Card>
  );
}

export default function StaffPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [permissionsResult, rolesResult, staffResult] = await Promise.all([
        api.get<Permission[]>("/admin/permissions"),
        api.get<Role[]>("/admin/roles"),
        api.get<StaffUser[]>("/admin/staff"),
      ]);
      setPermissions(permissionsResult);
      setRoles(rolesResult);
      setStaffUsers(staffResult);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load staff/roles");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() is also reused to refetch after mutations below, so it must stay a named async function, not inline .then() chaining.
    void load();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {error && <Banner kind="error">{error}</Banner>}
      <RolesPanel permissions={permissions} roles={roles} onChanged={load} />
      <StaffPanel staffUsers={staffUsers} roles={roles} onChanged={load} />
    </div>
  );
}
