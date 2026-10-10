"use client";

import { useState, useTransition } from "react";
import { updateBehavior } from "@/features/account/actions";
import type { BehaviorPreferences } from "@/features/account/preferences";
import { useUI } from "@/lib/ui-store";

/**
 * Local state for a group of behavior settings, written through
 * `updateBehavior` on every change.
 *
 * Like the appearance page: no save button — the change shows immediately
 * and is stored in the same step. If the server refuses, the old value
 * comes back and the reason is toasted, instead of the control claiming
 * something that isn't true.
 */
export function useBehavior<K extends keyof BehaviorPreferences>(
  initial: Pick<BehaviorPreferences, K>,
) {
  const [values, setValues] = useState(initial);
  const [, startTransition] = useTransition();
  const { toast } = useUI();

  const set = (patch: Partial<Pick<BehaviorPreferences, K>>) => {
    const before = values;
    setValues((current) => ({ ...current, ...patch }));
    startTransition(async () => {
      const result = await updateBehavior(
        patch as Partial<BehaviorPreferences>,
      );
      if ("error" in result) {
        setValues(before);
        toast(result.error);
      }
    });
  };

  return [values, set] as const;
}
