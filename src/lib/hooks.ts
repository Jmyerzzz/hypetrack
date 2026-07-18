"use client";

import { useQuery } from "@tanstack/react-query";
import type { ActivityPayload, OverviewPayload } from "./api-types";

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

const RECENT_KEY = "hypetrack:recent";

export function readRecentAddresses(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(RECENT_KEY) ?? "[]",
    );
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
