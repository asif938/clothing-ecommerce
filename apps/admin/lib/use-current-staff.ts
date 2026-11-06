"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "./api";

export interface CurrentStaff {
  id: string;
  name: string;
  email: string;
  locale: string;
  permissions: string[];
  isSuperAdmin: boolean;
  totpEnabled: boolean;
}

export function useCurrentStaff() {
  const [staff, setStaff] = useState<CurrentStaff | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthenticated, setUnauthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<CurrentStaff>("/auth/me")
      .then((result) => {
        if (!cancelled) setStaff(result);
      })
      .catch((err) => {
        if (!cancelled && err instanceof ApiError && err.status === 401) setUnauthenticated(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function hasPermission(permission: string): boolean {
    return staff?.permissions.includes(permission) ?? false;
  }

  return { staff, loading, unauthenticated, hasPermission };
}
