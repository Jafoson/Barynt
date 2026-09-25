"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useId, useRef } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { ModalFooter } from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import type { SettingsSaveResult } from "@/features/plugins/types";
import type { SettingsForm, SettingValue } from "@/lib/plugins/settings";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import styles from "./pluginSettings.module.scss";
import { SettingsFields } from "./SettingsFields";
import { usePluginSettingsForm } from "./usePluginSettingsForm";

interface Props {
  /** The plugin's name, in the title. */
  name: string;
  form: SettingsForm;
  /** Saves the whole form: the action of the level, with its ids already in it. */
  save: (
    values: Record<string, SettingValue | null>,
  ) => Promise<SettingsSaveResult>;
  /** Called once it is saved, before the dialog closes. */
  onSaved: () => void;
  close: () => void;
  /** A bottom sheet (phone) instead of a dialog. */
  sheet?: boolean;
}

/**
 * A plugin's settings in a dialog (a sheet on a phone): the fields the manifest declared, and
 * a button that saves them all together. The server checks every value against the same
 * definition and says which setting is wrong, which shows under that field; nothing is written
 * unless all of them fit. The button stays off while nothing was changed.
 */
export function PluginSettingsModal({
  name,
  form,
  save,
  onSaved,
  close,
  sheet,
}: Props) {
  const t = useTranslations();
  const idPrefix = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);
  const settings = usePluginSettingsForm({
    form,
    save,
    // Said before the window goes, so the page reads again while it closes.
    onSaved: () => {
      onSaved();
      close();
    },
  });

  const title = t("pluginSettings.title", { name });
  const formId = `${idPrefix}-form`;

  return (
    <Modal
      width={480}
      variant={sheet ? "sheet" : "dialog"}
      style={sheet ? swipe.style : undefined}
      {...(sheet ? swipe.handlers : {})}
    >
      {sheet ? (
        <SheetHeader
          title={title}
          onClose={close}
          closeLabel={t("actions.close")}
        />
      ) : (
        <ModalHeader
          title={title}
          onClose={close}
          closeLabel={t("actions.close")}
        />
      )}

      <ModalBody ref={bodyRef}>
        <form
          id={formId}
          className={styles.form}
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
      </ModalBody>

      <ModalFooter>
        {!sheet && (
          <Button variant="ghost" disabled={settings.isPending} onClick={close}>
            {t("actions.cancel")}
          </Button>
        )}
        {/* A submit button of the form, though it sits in the footer: the browser checks
            the limits it knows (required, length, range, address) before `onSubmit`, and Enter
            in a field presses it. */}
        <Button
          variant="primary"
          type="submit"
          form={formId}
          disabled={!settings.dirty || settings.isPending}
        >
          {t("actions.save")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
