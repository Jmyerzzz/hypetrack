"use client";

import {
  type UseQueryResult,
  useQueries,
  useQuery,
} from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type {
  ActivityPayload,
  BenchmarksPayload,
  OverviewPayload,
  SubAccountsPayload,
} from "./api-types";
import {
  type BenchmarkId,
  type BenchmarkPeriod,
  isBenchmarkId,
} from "./benchmarks";

export type ViewMode = "table" | "cards";

const VIEW_KEY = "hypesleuth:view";
const DEFAULT_MODE: ViewMode = "cards";

/**
 * Table/card view preference. Cards are the default at every width — they
 * read better than a wide dense table, and the responsive grid keeps them
 * from stretching on a desktop — until the reader picks a view, after which
 * that choice sticks across tabs and sessions.
 */
export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return DEFAULT_MODE;
    try {
      const stored = window.localStorage.getItem(VIEW_KEY);
      if (stored === "table" || stored === "cards") return stored;
    } catch {
      /* private mode */
    }
    return DEFAULT_MODE;
  });

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

/**
 * One query per account, reduced to the single status a page section reads.
 * `data` arrives only once every account has answered: the all-accounts view
 * adds their figures together, and a total missing one of its parts would be
 * wrong rather than merely incomplete — which is also why one failure marks
 * the whole set failed, with `errorAt` naming which account it was.
 */
export type AccountsQuery<T> = {
  /** Each account's payload, in the order the addresses were given. */
  data: T[] | undefined;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  /** Index of the first account that failed; null when none did. */
  errorAt: number | null;
  refetch: () => void;
};

/**
 * Module-level so its identity is stable across renders — that is what lets
 * TanStack memoize the combined object, and in turn what keeps the merge
 * downstream of it from re-running on every render.
 */
function combineAccounts<T>(
  results: UseQueryResult<T, Error>[],
): AccountsQuery<T> {
  const errorAt = results.findIndex((r) => r.isError);
  const failed = errorAt !== -1;
  return {
    data: results.every((r) => r.data !== undefined)
      ? results.map((r) => r.data as T)
      : undefined,
    isPending: results.some((r) => r.isPending),
    isFetching: results.some((r) => r.isFetching),
    isError: failed,
    error: failed ? ((results[errorAt].error as Error) ?? null) : null,
    errorAt: failed ? errorAt : null,
    refetch: () => {
      for (const result of results) result.refetch();
    },
  };
}

export function useOverviews(
  addresses: string[],
  enabled = true,
): AccountsQuery<OverviewPayload> {
  return useQueries({
    queries: addresses.map((address) => ({
      queryKey: ["overview", address],
      queryFn: () => getJson<OverviewPayload>(`/api/overview/${address}`),
      refetchInterval: 30_000,
      enabled,
    })),
    combine: combineAccounts,
  });
}

export function useActivities(
  addresses: string[],
  enabled = true,
): AccountsQuery<ActivityPayload> {
  return useQueries({
    queries: addresses.map((address) => ({
      queryKey: ["activity", address],
      queryFn: () => getJson<ActivityPayload>(`/api/activity/${address}`),
      staleTime: 120_000,
      enabled,
    })),
    combine: combineAccounts,
  });
}

export function useSubAccounts(address: string) {
  return useQuery({
    queryKey: ["subaccounts", address],
    queryFn: () => getJson<SubAccountsPayload>(`/api/subaccounts/${address}`),
    staleTime: 5 * 60_000,
    // A failure here only hides the switcher; don't hold the page hostage.
    retry: 1,
  });
}

/**
 * Benchmark prices for one window. Global market data, so the query key
 * carries no address and every account on the page shares one fetch; it stays
 * disabled until a benchmark is actually switched on, so a reader who never
 * uses the comparison never pays for it. A failure only dims the chips.
 */
export function useBenchmarks(period: BenchmarkPeriod, enabled: boolean) {
  return useQuery({
    queryKey: ["benchmarks", period],
    queryFn: () => getJson<BenchmarksPayload>(`/api/benchmarks/${period}`),
    staleTime: 60_000,
    enabled,
    retry: 1,
  });
}

const BENCHMARK_KEY = "hypesleuth:benchmarks";

function readBenchmarks(): BenchmarkId[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(BENCHMARK_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter(
          (x): x is BenchmarkId => typeof x === "string" && isBenchmarkId(x),
        )
      : [];
  } catch {
    return [];
  }
}

/**
 * Which benchmarks the chart is comparing against. Off by default — the
 * account's own curve is the subject — but a reader who turns one on is
 * comparing, so the choice sticks across sessions like the view and privacy
 * toggles. Read lazily on mount rather than during render so the server and
 * the first client pass agree.
 */
export function useBenchmarkToggles(): [
  BenchmarkId[],
  (id: BenchmarkId) => void,
] {
  const [selected, setSelected] = useState<BenchmarkId[]>([]);

  useEffect(() => {
    const stored = readBenchmarks();
    if (stored.length > 0) setSelected(stored);
  }, []);

  const toggle = useCallback((id: BenchmarkId) => {
    setSelected((current) => {
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      try {
        window.localStorage.setItem(BENCHMARK_KEY, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  }, []);

  return [selected, toggle];
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
