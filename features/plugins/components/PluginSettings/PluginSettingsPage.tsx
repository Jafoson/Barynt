"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import { LinkButton } from "@/components/ui/atoms/LinkButton/LinkButton";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { SettingsBody } from "@/components/ui/layout/SettingsList/SettingsList";
import type { SettingsSaveResult } from "@/features/plugins/types";
import type { SettingsForm, SettingValue } from "@/lib/plugins/settings";
import { useUI } from "@/lib/ui-store";
import styles from "./pluginSettings.module.scss";
import { SettingsFields } from "./SettingsFields";
import { usePluginSettingsForm } from "./usePluginSettingsForm";

interface Props {
  name: string;
  description: string;
  version: string;
  /** Whose settings these are, in a sentence: "Applies to the whole workspace." */
  note: string;
  /** A way back to where the plugin's settings were chosen, above the intro: the projects to choose from. */
  back?: { href: string; label: string };
  form: SettingsForm;
  /** Saves the whole form: the action of the level, with its ids already in it. */
  save: (
    values: Record<string, SettingValue | null>,
  ) => Promise<SettingsSaveResult>;
}

/**
 * One plugin's settings as a page of the plugins' settings: the plugin's name and what it is,
 * the form, and Save in the header where the other settings pages have it. The same form as in
 * the window (`usePluginSettingsForm`, `SettingsFields`), so a value is typed, checked and
 * refused the same way. Once it is saved a toast says so and the page reads again; the form
 * stays, and starts over from what it sent.
 */
export function PluginSettingsPage({
  name,
  description,
  version,
  note,
  back,
  form,
  save,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const { toast } = useUI();
  const idPrefix = useId();
  const formId = `${idPrefix}-form`;
  const settings = usePluginSettingsForm({
    form,
    save,
    onSaved: () => {
      toast(t("pluginSettings.saved"));
      router.refresh();
    },
  });

  return (
    <>
      <PageHeader
        divider={false}
        title={name}
        actions={
          // A submit button of the form, though it sits in the header: the browser checks the
          // limits it knows before `onSubmit`, and it is off while nothing was changed.
          <Button
            variant="primary"
            type="submit"
            form={formId}
            disabled={!settings.dirty || settings.isPending}
          >
            {t("actions.save")}
          </Button>
        }
      />

      <SettingsBody>
        <div className={styles.pageIntro}>
          {back && (
            <LinkButton
              href={back.href}
              variant="text"
              size="sm"
              icon={<Icon icon="lucide:chevron-left" width={14} />}
              className={styles.back}
            >
              {back.label}
            </LinkButton>
          )}
          {description && (
            <p className={styles.pageDescription}>{description}</p>
          )}
          <p className={styles.pageMeta}>
            <Badge size="sm" mono>
              {version}
            </Badge>
            <span>{note}</span>
          </p>
        </div>

        <form
          id={formId}
          className={styles.pageForm}
          onSubmit={(e) => {
            e.preventDefault();
            settings.submit();
          }}
        >
          <SettingsFields
            fields={form.fields}
            state={settings.state}
            errors={settings.errors}
            disabled={settings.isPending}
            idPrefix={idPrefix}
            onChange={settings.change}
          />
          {settings.failure && (
            <p className={styles.error} role="alert">
              <Icon icon="lucide:circle-alert" width={14} />
              {settings.failure}
            </p>
          )}
        </form>
      </SettingsBody>
    </>
  );
}
