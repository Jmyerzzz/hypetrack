"use client";

import { type Dispatch, type SetStateAction, useState } from "react";
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
  // The date pair is the rare choice and costs a whole row on a phone, so
  // there it hides behind a toggle. Desktop has the width to show it outright.
  const [showDates, setShowDates] = useState(false);
  const dated = timeWindow.preset === "custom";

  const setPreset = (preset: WindowPreset) => {
    setShowDates(false);
    onChange({ preset, from: "", to: "" });
  };

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
    // Full width only on a phone (the presets stretch there); from sm the
    // picker hugs its content so the account switcher can share its row.
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
        <SegmentedControl
          options={WINDOW_PRESETS}
          value={timeWindow.preset}
          onChange={setPreset}
          size="xs"
          fullWidth
        />
        <button
          type="button"
          onClick={() => setShowDates((open) => !open)}
          aria-expanded={showDates || dated}
          className={`shrink-0 rounded-lg border border-edge px-2.5 py-1.5 text-[11px] font-medium transition-colors sm:hidden ${
            dated ? "bg-panel2 text-ink" : "text-ink3 hover:text-ink2"
          }`}
        >
          Dates
        </button>
      </div>
      {/* Always in the layout from sm up; on a phone only once asked for, or
        when a date is already set and hiding it would strand the control.
        Full width there so the two date fields aren't squeezed into whatever
        the presets leave behind. */}
      <div
        className={`w-full min-w-0 sm:w-auto sm:flex-none ${
          showDates || dated ? "block" : "hidden sm:block"
        }`}
      >
        <FilterDateRange
          from={timeWindow.from}
          to={timeWindow.to}
          onFromChange={(from) => setDates({ from })}
          onToChange={(to) => setDates({ to })}
          label="Trades opened"
        />
      </div>
    </div>
  );
}
