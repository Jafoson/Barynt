"use client";

import { createContext } from "react";
import type { CatalogEntry } from "@/lib/plugins/store/catalog";

/**
 * Where the store is opened, for the parts that differ: the platform's page installs, a
 * workspace's page **adds** a plugin for that workspace and can **switch on** one the platform
 * has already. A context and not props on every card, so the card, the shelf and the details
 * agree without each being told. Outside a provider it is the platform's page.
 */
export interface StoreMode {
  /** A workspace's page. */
  workspace: boolean;
  /** Installed on the platform and off in this workspace: the action is to switch it on. */
  switchOn: ReadonlySet<string>;
  onSwitchOn: ((entry: CatalogEntry) => void) | null;
}

export const PLATFORM_MODE: StoreMode = {
  workspace: false,
  switchOn: new Set(),
  onSwitchOn: null,
};

export const StoreModeContext = createContext<StoreMode>(PLATFORM_MODE);
