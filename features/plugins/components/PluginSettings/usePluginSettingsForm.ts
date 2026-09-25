"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { SettingsSaveResult } from "@/features/plugins/types";
import type { SettingsForm, SettingValue } from "@/lib/plugins/settings";
import { type FieldState, initialState, isDirty, saveForm } from "./formState";

interface Options {
  form: SettingsForm;
  /** Saves the whole form: the action of the level, with its ids already in it. */
  save: (
    values: Record<string, SettingValue | null>,
  ) => Promise<SettingsSaveResult>;
  /** Called once it is saved. */
  onSaved: () => void;
}

/**
 * What a plugin's settings form does while someone works in it, for the window and for the page:
 * the values as they are typed, a problem under the setting it is about (gone when that setting is
 * edited), the general line above the buttons, whether anything was changed, and the save. Saving
 * what was just saved is nothing to do: the form starts over from what it sent.
 */
export function usePluginSettingsForm({ form, save, onSaved }: Options) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();
  const [start, setStart] = useState(() => initialState(form));
  const [state, setState] = useState(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState("");

  const dirty = isDirty(start, state);

  const submit = () => {
    if (!dirty || isPending) return;
    startTransition(async () => {
      const outcome = await saveForm(form, state, save, {
        saveFailed: t("pluginSettings.saveFailed"),
        notValid: t("pluginSettings.notValid"),
        tooLarge: t("pluginSettings.tooLarge"),
      });
      if (outcome.saved) {
        // What was sent is what is stored now.
        setStart(state);
        onSaved();
        return;
      }
      setErrors(outcome.errors);
      setFailure(outcome.failure);
    });
  };

  const change = (id: string, value: FieldState) => {
    setState((current) => ({ ...current, [id]: value }));
    // Only this setting's problem goes: the others are still true.
    setErrors(({ [id]: _gone, ...rest }) => rest);
    setFailure("");
  };

  return { state, errors, failure, dirty, isPending, submit, change };
}
