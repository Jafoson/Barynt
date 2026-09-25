"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Chip } from "@/components/ui/atoms/Chip/Chip";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { SettingsBody } from "@/components/ui/layout/SettingsList/SettingsList";
import { setPluginCurated } from "@/features/plugin-stores/visibilityActions";
import { enablePluginInProject } from "@/features/plugins/projectActions";
import { addStorePluginToProject } from "@/features/plugins/projectStoreActions";
import {
  installStorePlugin,
  updateStorePlugin,
} from "@/features/plugins/storeActions";
import type { StoreCatalogView } from "@/features/plugins/storeQueries";
import {
  categoryCounts,
  filterEntries,
  pickFeatured,
  type StoreView,
} from "@/features/plugins/storeView";
import { enablePlugin } from "@/features/plugins/workspaceActions";
import { addStorePluginToWorkspace } from "@/features/plugins/workspaceStoreActions";
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
import { PLATFORM_MODE, type StoreMode, StoreModeContext } from "./storeMode";
import { UpdateFromStoreModal } from "./UpdateFromStoreModal";

interface Props {
  view: StoreCatalogView;
  /**
   * Set on a workspace's page: the store there **adds** a plugin for the workspace and can
   * switch on one the platform has already, and has no release switch and no update button
   * (those are the platform's).
   */
  workspace?: { id: string; switchOn: string[] };
  /**
   * Set on a project's page: the same as a workspace's, for the plugins that apply per project.
   * `basePath` is the project's plugins page, where the two tabs point.
   */
  project?: { id: string; switchOn: string[]; basePath: string };
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
export function PluginStore({ view, workspace, project, initial }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const { openModal } = useModal();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState(initial?.query ?? "");
  const [category, setCategory] = useState<string | null>(
    initial?.category ?? null,
  );
  const [storeView, setStoreView] = useState<StoreView>(
    initial?.view ?? "discover",
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Whose page this is: the platform's, a workspace's or a project's. It decides the words and
  // which actions the buttons call; a workspace's and a project's page add and switch on, the
  // platform's installs.
  const level: StoreMode["level"] = workspace
    ? "workspace"
    : project
      ? "project"
      : "platform";
  const inLevel = level !== "platform";
  /** The words of this level (`workspaceStore.*` or `projectStore.*`), which have the same keys. */
  const levelText = (name: string, params?: Record<string, string>): string =>
    t(`${level}Store.${name}` as "workspaceStore.add", params);

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

  const openInstallDialog = (entry: CatalogEntry, version: string) =>
    openModal(
      ({ close }) => (
        <InstallFromStoreModal
          entry={entry}
          version={version}
          close={close}
          sheet={isPhone}
          level={level}
          onConfirm={async () => {
            const args = [entry.storeId, entry.id, version] as const;
            const yes = { acknowledged: true };
            const result = workspace
              ? await addStorePluginToWorkspace(workspace.id, ...args, yes)
              : project
                ? await addStorePluginToProject(project.id, ...args, yes)
                : await installStorePlugin(...args, yes);
            if ("error" in result) return result.error;
            // Done, and something on the way was not: the page says so once the dialog is gone.
            setNotice(
              result.warning
                ? levelText("addedNotOn", { message: result.warning })
                : "",
            );
            router.refresh();
            return null;
          }}
        />
      ),
      modalOptions(entry.name),
    );

  /** Updates an installed plugin, from the store it came from: the server finds that store itself. */
  const openUpdateDialog = (entry: CatalogEntry, version: string) =>
    openModal(
      ({ close }) => (
        <UpdateFromStoreModal
          entry={entry}
          version={version}
          close={close}
          sheet={isPhone}
          onConfirm={async () => {
            const result = await updateStorePlugin(entry.id, version, {
              acknowledged: true,
            });
            if ("error" in result) return result.error;
            setNotice("");
            router.refresh();
            return null;
          }}
        />
      ),
      modalOptions(entry.name),
    );

  /**
   * What the button on a plugin does: an installed one is updated (the button is only there
   * when there is an update, and only on the platform's page), any other is installed.
   */
  const openInstall = (entry: CatalogEntry, version: string) =>
    entry.installed
      ? openUpdateDialog(entry, version)
      : openInstallDialog(entry, version);

  /** Switches on, in this workspace or project, a plugin the platform has installed already. */
  const switchOn = inLevel
    ? (entry: CatalogEntry) =>
        startTransition(async () => {
          const result = workspace
            ? await enablePlugin(workspace.id, entry.id)
            : await enablePluginInProject(project?.id ?? "", entry.id);
          if ("error" in result) {
            setError(result.error);
            return;
          }
          setError("");
          setNotice(
            result.warning
              ? levelText("addedNotOn", { message: result.warning })
              : "",
          );
          router.refresh();
        })
    : null;

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
          {...(inLevel
            ? {}
            : {
                onRelease: async (next: boolean) => {
                  const result = await setPluginCurated(
                    entry.storeId,
                    entry.id,
                    next,
                  );
                  if ("error" in result) return result.error;
                  router.refresh();
                  return null;
                },
              })}
        />
      ),
      modalOptions(entry.name),
    );

  const noStores = catalog.stores.length === 0;
  const listEmpty = shown.length === 0;

  const mode = inLevel
    ? {
        level,
        switchOn: new Set((workspace ?? project)?.switchOn),
        onSwitchOn: switchOn,
      }
    : PLATFORM_MODE;

  return (
    <StoreModeContext.Provider value={mode}>
      <PageHeader
        divider={false}
        title={t("pluginStore.title")}
        actions={
          <PluginsTabs
            active="store"
            workspaceId={workspace?.id}
            basePath={project?.basePath}
          />
        }
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

          {error && (
            <p className={styles.error} role="alert">
              <Icon icon="lucide:circle-alert" width={14} />
              {error}
            </p>
          )}
          {notice && (
            <output className={styles.notice}>
              <Icon icon="lucide:triangle-alert" width={14} />
              {notice}
            </output>
          )}
          {view.problem && (
            <p className={styles.error} role="alert">
              <Icon icon="lucide:circle-alert" width={14} />
              {view.problem}
            </p>
          )}
          {noStores && !view.problem && (
            <p className={styles.notice}>
              <Icon icon="lucide:info" width={14} />
              {inLevel ? (
                levelText("noStores")
              ) : (
                <span>
                  {t("pluginStore.noStores")}{" "}
                  <Link href={adminPath("plugin-stores")}>
                    {t("pluginStore.noStoresLink")}
                  </Link>
                </span>
              )}
            </p>
          )}
          {!noStores && (
            <div className={styles.syncList}>
              {catalog.stores.map((store) => (
                <StoreSync
                  key={store.id}
                  store={store}
                  readOnly={inLevel}
                  level={level}
                />
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
              <p className={styles.empty}>
                {inLevel && visibility.curatedOnly
                  ? levelText("nothingReleased")
                  : t("pluginStore.noEntries")}
              </p>
            )}
        </div>
      </SettingsBody>
    </StoreModeContext.Provider>
  );
}
