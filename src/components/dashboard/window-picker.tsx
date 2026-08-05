"use client";

import type { Dispatch, SetStateAction } from "react";
import { FilterDateRange, SegmentedControl } from "@/components/ui";
import {
  type TimeWindow,
  WINDOW_PRESETS,
  type WindowPreset,
} from "@/lib/trades";

/**
 * The page's single time control. Everything trade-derived below it — the
 * equity curve, the summary cards, PnL by coin, the performance strip and the
 * trade table — reads the window this sets, so there's one place to change
 * scope and one answer to "which period am I looking at".
 */
export function WindowPicker({
  timeWindow,
  onChange,
}: {
  timeWindow: TimeWindow;
  onChange: Dispatch<SetStateAction<TimeWindow>>;
}) {
  const setPreset = (preset: WindowPreset) =>
    onChange({ preset, from: "", to: "" });

  // Typing a date is itself the choice of a custom window, so the presets
  // deselect rather than making the user pick a "custom" mode first. Updated
  // from the previous window rather than the prop: clearing the range fires
  // both setters in one tick.
  const setDates = (dates: { from?: string; to?: string }) =>
    onChange((w) => {
      const next = { from: w.from, to: w.to, ...dates };
      return {
        ...next,
        preset: next.from === "" && next.to === "" ? "allTime" : "custom",
      };
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        options={WINDOW_PRESETS}
        value={timeWindow.preset}
        onChange={setPreset}
        size="xs"
      />
      <FilterDateRange
        from={timeWindow.from}
        to={timeWindow.to}
        onFromChange={(from) => setDates({ from })}
        onToChange={(to) => setDates({ to })}
        label="Trades opened"
      />
    </div>
  );
}
