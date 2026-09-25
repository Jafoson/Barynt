"use client";

import { createContext } from "react";
import type { CatalogEntry } from "@/lib/plugins/store/catalog";

/**
 * Where the store is opened, for the parts that differ: the platform's page installs, a
 * workspace's or a project's page **adds** a plugin for that workspace or project and can
 * **switch on** one the platform has already. A context and not props on every card, so the card, the shelf and the details
 * agree without each being told. Outside a provider it is the platform's page.
 */
export interface StoreMode {
  /** Whose page: the platform's, a workspace's or a project's. It decides the words. */
  level: "platform" | "workspace" | "project";
  /** Installed on the platform and off at this level: the action is to switch it on. */
  switchOn: ReadonlySet<string>;
  onSwitchOn: ((entry: CatalogEntry) => void) | null;
}

export const PLATFORM_MODE: StoreMode = {
  level: "platform",
  switchOn: new Set(),
  onSwitchOn: null,
};

export const StoreModeContext = createContext<StoreMode>(PLATFORM_MODE);
