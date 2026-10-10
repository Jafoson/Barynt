"use client";

import { createContext, useContext } from "react";
import {
  type BehaviorPreferences,
  DEFAULT_BEHAVIOR,
} from "@/features/account/preferences";

const Ctx = createContext<BehaviorPreferences>(DEFAULT_BEHAVIOR);

/**
 * The signed-in person's behavior settings, for client components.
 *
 * Filled once in the root layout from the same row the server reads — the
 * settings page saves through `updateBehavior`, which revalidates the
 * layout, so a change arrives here with the next render. Outside a provider
 * (a test, the login page) it answers with the defaults.
 */
export function PreferencesProvider({
  value,
  children,
}: {
  value: BehaviorPreferences;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePreferences(): BehaviorPreferences {
  return useContext(Ctx);
}
