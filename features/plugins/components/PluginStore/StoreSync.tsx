"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { syncPluginStores } from "@/features/plugins/storeActions";
import type { CatalogStoreState } from "@/lib/plugins/store/catalog";
import { useTimeAgo } from "@/lib/utils/useTimeAgo";
import styles from "./pluginStore.module.scss";

interface Props {
  store: CatalogStoreState;
}

/**
 * One store on the store page: when it was last fetched, a button to fetch it now, and what
 * is wrong with it. A store that could not be updated says why and which state is shown,
 * so the list never looks complete when it is not. The fetch itself is on the server
 * (`syncPluginStores`, which needs `plugin.manage`); how it went is on the store's row, and
 * the page reads it from there.
 */
export function StoreSync({ store }: Props) {
  const t = useTranslations();
  const timeAgo = useTimeAgo();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const update = () =>
    startTransition(async () => {
      setProblem(null);
      const result = await syncPluginStores(store.id);
      if ("error" in result) setProblem(result.error);
      router.refresh();
    });

  const since = store.syncedAt ? timeAgo(store.syncedAt.getTime()) : null;

  return (
    <div className={styles.sync}>
      <div className={styles.syncRow}>
        <span className={styles.syncName}>{store.name}</span>
        <span className={styles.syncStatus}>
          {since
            ? t("pluginStore.syncedAt", { time: since })
            : t("pluginStore.syncNever")}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className={styles.syncButton}
          icon={
            <Icon
              icon="lucide:refresh-cw"
              width={14}
              className={pending ? styles.spin : undefined}
            />
          }
          disabled={pending}
          aria-busy={pending}
          aria-label={t("pluginStore.syncLabel", { store: store.name })}
          onClick={update}
        >
          {pending ? t("pluginStore.syncing") : t("pluginStore.sync")}
        </Button>
      </div>

      {problem && (
        <p className={styles.error} role="alert">
          <Icon icon="lucide:circle-alert" width={14} />
          {problem}
        </p>
      )}
      {store.syncError && (
        <p className={styles.error} role="alert">
          <Icon icon="lucide:circle-alert" width={14} />
          <span>
            {since
              ? t("pluginStore.syncFailed", {
                  store: store.name,
                  time: since,
                })
              : t("pluginStore.syncFailedNothing", { store: store.name })}{" "}
            <span className={styles.reason}>{store.syncError}</span>
          </span>
        </p>
      )}
      {!store.syncError && store.errorCode === "not-fetched" && (
        <p className={styles.notice}>
          <Icon icon="lucide:info" width={14} />
          {t("pluginStore.storeNotFetched", { store: store.name })}
        </p>
      )}
      {store.error && store.errorCode === "unreadable" && (
        <p className={styles.error} role="alert">
          <Icon icon="lucide:circle-alert" width={14} />
          {t("pluginStore.storeError", {
            store: store.name,
            error: store.error,
          })}
        </p>
      )}
      {store.problems.length > 0 && (
        <p className={styles.notice}>
          <Icon icon="lucide:triangle-alert" width={14} />
          {t("pluginStore.storeProblems", {
            count: store.problems.length,
            store: store.name,
          })}
        </p>
      )}
    </div>
  );
}
