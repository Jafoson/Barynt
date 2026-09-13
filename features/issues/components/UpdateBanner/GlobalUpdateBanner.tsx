"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UpdateBanner } from "./UpdateBanner";
import { useProjectUpdates } from "./useProjectUpdates";

interface GlobalUpdateBannerProps {
  workspaceId: string;
}

/**
 * Mounted once per workspace, in `[workspace]/layout.tsx` — one subscription
 * for the whole workspace instead of one per board, so a change shows up no
 * matter which page happens to be open when it happens.
 */
export function GlobalUpdateBanner({ workspaceId }: GlobalUpdateBannerProps) {
  const t = useTranslations();
  const router = useRouter();
  const updates = useProjectUpdates({ workspaceId });

  return (
    <UpdateBanner
      visible={updates.stale}
      label={t("realtime.staleGlobal")}
      refreshLabel={t("realtime.refresh")}
      onRefresh={() => {
        updates.dismiss();
        router.refresh();
      }}
    />
  );
}
