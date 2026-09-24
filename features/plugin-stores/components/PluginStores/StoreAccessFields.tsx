"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/atoms/Input/Input";
import {
  MAX_STORE_TOKEN_LENGTH,
  MAX_STORE_USERNAME_LENGTH,
} from "@/features/plugin-stores/constants";

interface Props {
  token: string;
  username: string;
  onToken: (value: string) => void;
  onUsername: (value: string) => void;
  disabled?: boolean;
  /** Says a token is stored: it is never shown, so the field says so instead. */
  tokenStored?: boolean;
  autoFocus?: boolean;
}

/**
 * The two fields for access to a private repository, shared by the dialog that
 * connects a store and the one that changes its access. The token is a
 * password field on purpose (no over-the-shoulder reading, no history), and
 * `new-password` keeps a password manager from filling the user's own login in.
 */
export function StoreAccessFields({
  token,
  username,
  onToken,
  onUsername,
  disabled,
  tokenStored,
  autoFocus,
}: Props) {
  const t = useTranslations();
  return (
    <>
      <Input
        variant="password"
        autoFocus={autoFocus}
        label={t("pluginStores.tokenLabel")}
        placeholder={
          tokenStored ? t("pluginStores.tokenStoredPlaceholder") : undefined
        }
        name="plugin-store-token"
        autoComplete="new-password"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={MAX_STORE_TOKEN_LENGTH}
        value={token}
        disabled={disabled}
        onChange={(e) => onToken(e.target.value)}
      />
      <Input
        label={t("pluginStores.usernameLabel")}
        hint={t("pluginStores.usernameHint")}
        name="plugin-store-username"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={MAX_STORE_USERNAME_LENGTH}
        value={username}
        disabled={disabled}
        onChange={(e) => onUsername(e.target.value)}
      />
    </>
  );
}
