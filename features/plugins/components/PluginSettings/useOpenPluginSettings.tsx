"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { SettingsSaveResult } from "@/features/plugins/types";
import { useModal } from "@/lib/context";
import type { SettingsForm, SettingValue } from "@/lib/plugins/settings";
import { useUI } from "@/lib/ui-store";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import { PluginSettingsModal } from "./PluginSettingsModal";

/** What opens a plugin's settings: whose they are, and the action that saves them. */
interface Target {
  name: string;
  form: SettingsForm;
  save: (
    values: Record<string, SettingValue | null>,
  ) => Promise<SettingsSaveResult>;
}

/**
 * Opens a plugin's settings: a dialog from a tablet up, a bottom sheet on a phone. The platform's
 * plugins page, a workspace's and a project's all open the same window, so the choice is made
 * here once. Once it is saved the page is read again (the form was made from what the server
 * read) and a toast says so.
 */
export function useOpenPluginSettings(): (target: Target) => void {
  const t = useTranslations("pluginSettings");
  const router = useRouter();
  const { openModal } = useModal();
  const { toast } = useUI();
  const isPhone = useMediaQuery(PHONE_QUERY);

  return ({ name, form, save }) =>
    openModal(
      ({ close }) => (
        <PluginSettingsModal
          name={name}
          form={form}
          save={save}
          sheet={isPhone}
          close={close}
          onSaved={() => {
            toast(t("saved"));
            router.refresh();
          }}
        />
      ),
      {
        ...(isPhone ? { placement: "bottom" as const } : {}),
        label: t("title", { name }),
      },
    );
}
