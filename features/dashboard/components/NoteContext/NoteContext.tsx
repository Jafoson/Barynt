"use client";

import { createContext, useContext } from "react";
import type { NotePage } from "@/features/dashboard/widgets";

/**
 * What a note widget needs to be written in place (BARY-169): whether this
 * person may, and how to keep what they typed. The dashboard provides it;
 * a note without it (the gallery's preview) is read-only.
 */
export interface NoteContextValue {
  canWrite: boolean;
  save: (widgetId: string, pages: NotePage[]) => void;
}

export const NoteContext = createContext<NoteContextValue | null>(null);

export function useNoteContext(): NoteContextValue | null {
  return useContext(NoteContext);
}
