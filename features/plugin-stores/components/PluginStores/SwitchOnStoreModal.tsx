"use client";

import { useTranslations } from "next-intl";
import { AcknowledgeModal } from "./AcknowledgeModal";
import { TrustNotice } from "./TrustNotice";

interface Props {
  storeName: string;
  /** Switches the store on. `null` = done, otherwise the error text to show. */
  onSwitchOn: () => Promise<string | null>;
  close: () => void;
  sheet?: boolean;
}

/**
 * Switching a store on again asks the same question as connecting it: a store
 * that was off is a store whose plugins may be approved again. The main store is
 * the exception and is switched on without it.
 */
export function SwitchOnStoreModal({
  storeName,
  onSwitchOn,
  close,
  sheet,
}: Props) {
  const t = useTranslations();
  return (
    <AcknowledgeModal
      title={t("pluginStores.switchOnTitle", { name: storeName })}
      confirmLabel={t("pluginStores.switchOn")}
      notice={(state) => <TrustNotice {...state} />}
      onConfirm={onSwitchOn}
      close={close}
      sheet={sheet}
    />
  );
}
