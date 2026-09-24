"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Chip } from "@/components/ui/atoms/Chip/Chip";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { SettingsBody } from "@/components/ui/layout/SettingsList/SettingsList";
import { setPluginCurated } from "@/features/plugin-stores/visibilityActions";
import { installStorePlugin } from "@/features/plugins/storeActions";
import type { StoreCatalogView } from "@/features/plugins/storeQueries";
import {
  categoryCounts,
  filterEntries,
  pickFeatured,
  type StoreView,
} from "@/features/plugins/storeView";
import { Link } from "@/i18n/navigation";
import { useModal } from "@/lib/context";
import { adminPath } from "@/lib/nav";
import type { CatalogEntry } from "@/lib/plugins/store/catalog";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import { PluginsTabs } from "../PluginsTabs/PluginsTabs";
import { FeaturedPlugins } from "./FeaturedPlugins";
import { InstallFromStoreModal } from "./InstallFromStoreModal";
import { PluginCard } from "./PluginCard";
import styles from "./pluginStore.module.scss";
import { StoreDetailModal } from "./StoreDetailModal";
import { StoreSync } from "./StoreSync";

interface Props {
  view: StoreCatalogView;
  /** Where the page starts: what is typed, the category and the view. All empty by default. */
  initial?: { query?: string; category?: string | null; view?: StoreView };
}

/**
 * The plugin store for the platform admin: search, categories, what is installed, the
 * plugins to feature, and a card for each plugin, with its details and an install button
 * on each. It shows what the stores that are on list (read from their local clones), and
 * says so when a store has not been fetched, cannot be read or has entries that cannot be
 * used, instead of showing a list that looks complete and is not.
 *
 * Installing asks the server for the same yes the dialog asks for; releasing a plugin for
 * workspaces and projects is the platform admin's choice, here, in the details.
 */
export function PluginStore({ view, initial }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const { openModal } = useModal();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [query, setQuery] = useState(initial?.query ?? "");
  const [category, setCategory] = useState<string | null>(
    initial?.category ?? null,
  );
  const [storeView, setStoreView] = useState<StoreView>(
    initial?.view ?? "discover",
  );

  const { catalog, visibility } = view;
  const entries = catalog.entries;
  const released = new Set(view.released);
  const installedCount = entries.filter((e) => e.installed).length;
  const filter = { query, category, view: storeView };
  const shown = filterEntries(entries, filter);
  const counts = categoryCounts(entries, filter);
  const inTotal = filterEntries(entries, { ...filter, category: null }).length;
  const featured =
    storeView === "discover" && query.trim() === "" && category === null
      ? pickFeatured(entries)
      : [];

  const modalOptions = (label: string) => ({
    ...(isPhone ? { placement: "bottom" as const } : {}),
    label,
  });

  const openInstall = (entry: CatalogEntry, version: string) =>
    openModal(
      ({ close }) => (
        <InstallFromStoreModal
          entry={entry}
          version={version}
          close={close}
          sheet={isPhone}
          onConfirm={async () => {
            const result = await installStorePlugin(
              entry.storeId,
              entry.id,
              version,
              { acknowledged: true },
            );
            if ("error" in result) return result.error;
            router.refresh();
            return null;
          }}
        />
      ),
      modalOptions(entry.name),
    );

  const openDetails = (entry: CatalogEntry) =>
    openModal(
      ({ close }) => (
        <StoreDetailModal
          entry={entry}
          released={released.has(entry.key)}
          curatedOnly={visibility.curatedOnly}
          close={close}
          sheet={isPhone}
          onInstall={openInstall}
          onRelease={async (next) => {
            const result = await setPluginCurated(
              entry.storeId,
              entry.id,
              next,
            );
            if ("error" in result) return result.error;
            router.refresh();
            return null;
          }}
        />
      ),
      modalOptions(entry.name),
    );

  const noStores = catalog.stores.length === 0;
  const listEmpty = shown.length === 0;

  return (
    <>
      <PageHeader
        divider={false}
        title={t("pluginStore.title")}
        actions={<PluginsTabs active="store" />}
      />

      <SettingsBody>
        <div className={styles.store}>
          <section className={styles.hero}>
            <span className={styles.heroBadge}>
              {t("pluginStore.heroBadge")}
            </span>
            <h2 className={styles.heroTitle}>{t("pluginStore.heroTitle")}</h2>
            <p className={styles.heroText}>{t("pluginStore.heroText")}</p>
            <div className={styles.search}>
              <Input
                variant="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("pluginStore.searchPlaceholder")}
                aria-label={t("pluginStore.searchLabel")}
              />
            </div>
          </section>

          {view.problem && (
            <p className={styles.error} role="alert">
              <Icon icon="lucide:circle-alert" width={14} />
              {view.problem}
            </p>
          )}
          {noStores && !view.problem && (
            <p className={styles.notice}>
              <Icon icon="lucide:info" width={14} />
              <span>
                {t("pluginStore.noStores")}{" "}
                <Link href={adminPath("plugin-stores")}>
                  {t("pluginStore.noStoresLink")}
                </Link>
              </span>
            </p>
          )}
          {!noStores && (
            <div className={styles.syncList}>
              {catalog.stores.map((store) => (
                <StoreSync key={store.id} store={store} />
              ))}
            </div>
          )}

          {entries.length > 0 && (
            <div className={styles.filters}>
              <div className={styles.chips}>
                <Chip
                  type="filter"
                  variant="outline"
                  selected={category === null}
                  onClick={() => setCategory(null)}
                >
                  {t("pluginStore.all")}
                  <span className={styles.count}>{inTotal}</span>
                </Chip>
                {counts.map(({ category: id, count }) => (
                  <Chip
                    key={id}
                    type="filter"
                    variant="outline"
                    selected={category === id}
                    onClick={() => setCategory(category === id ? null : id)}
                  >
                    {t(
                      `pluginStore.category.${id}` as "pluginStore.category.other",
                    )}
                    <span className={styles.count}>{count}</span>
                  </Chip>
                ))}
              </div>
              <SegmentedControl
                variant="surface"
                value={storeView}
                onChange={(value) => setStoreView(value as StoreView)}
                items={[
                  { value: "discover", label: t("pluginStore.viewDiscover") },
                  {
                    value: "installed",
                    label: `${t("pluginStore.viewInstalled")} ${installedCount}`,
                  },
                ]}
              />
            </div>
          )}

          {featured.length > 0 && (
            <FeaturedPlugins
              entries={featured}
              onOpen={openDetails}
              onInstall={openInstall}
            />
          )}

          {entries.length > 0 && !listEmpty && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                {storeView === "installed"
                  ? t("pluginStore.viewInstalled")
                  : t("pluginStore.allPlugins")}
                <Badge mono>{shown.length}</Badge>
              </h2>
              <div className={styles.grid}>
                {shown.map((entry) => (
                  <PluginCard
                    key={entry.key}
                    entry={entry}
                    released={visibility.curatedOnly && released.has(entry.key)}
                    onOpen={openDetails}
                    onInstall={openInstall}
                  />
                ))}
              </div>
            </section>
          )}

          {entries.length > 0 && listEmpty && (
            <p className={styles.empty}>
              {query.trim() !== ""
                ? t("pluginStore.noResults", { query: query.trim() })
                : storeView === "installed"
                  ? t("pluginStore.noInstalled")
                  : t("pluginStore.noResultsCategory")}
            </p>
          )}
          {entries.length === 0 &&
            !noStores &&
            !catalog.stores.some((s) => s.error) && (
              <p className={styles.empty}>{t("pluginStore.noEntries")}</p>
            )}
        </div>
      </SettingsBody>
    </>
  );
}
