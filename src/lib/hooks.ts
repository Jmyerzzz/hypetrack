"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ActivityPayload, OverviewPayload } from "./api-types";

export type ViewMode = "table" | "cards";

const VIEW_KEY = "hypesleuth:view";
/** Tailwind's `sm` breakpoint — below it, tables need horizontal scrolling. */
const TABLE_MIN_WIDTH = "(min-width: 640px)";

function preferredMode(): ViewMode {
  if (typeof window === "undefined") return "table";
  return window.matchMedia(TABLE_MIN_WIDTH).matches ? "table" : "cards";
}

/**
 * Table/card view preference: cards on phones, tables on wider screens, until
 * the reader picks one — then that choice sticks across tabs and sessions.
 * These lists only render client-side (after the data query resolves), so the
 * viewport is known on first paint and there's no flash or hydration mismatch.
 */
export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "table";
    try {
      const stored = window.localStorage.getItem(VIEW_KEY);
      if (stored === "table" || stored === "cards") return stored;
    } catch {
      /* private mode */
    }
    return preferredMode();
  });

  // Follow rotation/resize until the reader expresses a preference.
  useEffect(() => {
    let explicit = false;
    try {
      explicit = window.localStorage.getItem(VIEW_KEY) != null;
    } catch {
      /* private mode */
    }
    if (explicit) return;
    const mq = window.matchMedia(TABLE_MIN_WIDTH);
    const onChange = () => setMode(mq.matches ? "table" : "cards");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const choose = (next: ViewMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
      window.dispatchEvent(
        new CustomEvent("hypesleuth:view", { detail: next }),
      );
    } catch {
      /* private mode */
    }
  };

  // Keep every list on the page in sync when one toggle is used.
  useEffect(() => {
    const onSync = (e: Event) => {
      const next = (e as CustomEvent<ViewMode>).detail;
      if (next === "table" || next === "cards") setMode(next);
    };
    window.addEventListener("hypesleuth:view", onSync);
    return () => window.removeEventListener("hypesleuth:view", onSync);
  }, []);

  return [mode, choose];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

export function useOverview(address: string) {
  return useQuery({
    queryKey: ["overview", address],
    queryFn: () => getJson<OverviewPayload>(`/api/overview/${address}`),
    refetchInterval: 30_000,
  });
}

export function useActivity(address: string) {
  return useQuery({
    queryKey: ["activity", address],
    queryFn: () => getJson<ActivityPayload>(`/api/activity/${address}`),
    staleTime: 120_000,
  });
}

const RECENT_KEY = "hypesleuth:recent";
const LEGACY_RECENT_KEY = "hypetrack:recent";

export function readRecentAddresses(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw =
      window.localStorage.getItem(RECENT_KEY) ??
      window.localStorage.getItem(LEGACY_RECENT_KEY) ??
      "[]";
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function rememberAddress(address: string): void {
  if (typeof window === "undefined") return;
  const next = [
    address,
    ...readRecentAddresses().filter((a) => a !== address),
  ].slice(0, 6);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}
