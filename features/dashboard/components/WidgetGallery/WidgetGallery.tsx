"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Input } from "@/components/ui/atoms/Input/Input";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import { ModalFooter } from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import {
  deleteCustomWidget,
  saveCustomWidget,
} from "@/features/dashboard/actions";
import type { WidgetData, WidgetDataMap } from "@/features/dashboard/types";
import {
  BUILDER_TYPES,
  type CustomWidgetEntry,
  newWidget,
  offeredOn,
  WIDGET_TYPES,
  WIDGETS,
  type Widget as WidgetModel,
  type WidgetSize,
  type WidgetType,
} from "@/features/dashboard/widgets";
import type { FilterLabelLookups } from "@/features/issues/components/Topbar/filterLabels";
import type { BucketUnit } from "@/lib/buckets";
import { randomId } from "@/lib/utils/id";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import { Widget } from "../Widget/Widget";
import { WidgetForm } from "../WidgetForm/WidgetForm";
import { type SampleWords, sampleData } from "./sampleData";
import styles from "./widgetGallery.module.scss";

interface Props {
  unit: BucketUnit;
  issueBase: string;
  workspaceSlug: string;
  kind: "project" | "workspace" | "view";
  sheet: boolean;
  /** Adds the widget; its real numbers are fetched by the dashboard. */
  onAdd: (widget: WidgetModel) => void;
  close: () => void;
  /** Custom widgets (BARY-170): the viewer's own and the shared ones. */
  workspaceId: string;
  customWidgets: CustomWidgetEntry[];
  /** Real numbers for a custom widget's preview and the builder. */
  load: (widgets: WidgetModel[]) => Promise<WidgetDataMap | null>;
  lookups: FilterLabelLookups;
  area: "project" | "my";
}

/** What the right side shows: a kind, a saved custom widget, the builder. */
type Selection =
  | { mode: "type"; type: WidgetType }
  | { mode: "custom"; id: string }
  | { mode: "build"; editing: CustomWidgetEntry | null };

/** Real data for widgets — fetched once per configuration. */
function useLiveData(
  load: Props["load"],
  widget: WidgetModel | null,
): WidgetData | undefined {
  const [cache, setCache] = useState<Record<string, WidgetData>>({});
  const key = widget ? JSON.stringify([widget.type, widget.config]) : "";
  useEffect(() => {
    if (!widget || cache[key]) return;
    let live = true;
    const timer = setTimeout(() => {
      void load([{ ...widget, id: "live" }]).then((data) => {
        const found = data?.live;
        if (live && found) setCache((c) => ({ ...c, [key]: found }));
      });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, widget, cache, load]);
  return widget ? cache[key] : undefined;
}

const GROUPS = ["numbers", "charts", "lists", "team", "other"] as const;

/**
 * "Add widget", like the widget gallery on iPhone and Mac: the kinds on
 * the left, the chosen one on the right in every size it offers — with this
 * dashboard's real numbers. Pick a size, add.
 */
export function WidgetGallery({
  unit,
  issueBase,
  workspaceSlug,
  kind,
  sheet,
  onAdd,
  close,
  workspaceId,
  customWidgets,
  load,
  lookups,
  area,
}: Props) {
  const t = useTranslations("widgets");
  const confirm = useConfirm();
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection>({
    mode: "type",
    type: "kpi",
  });
  const [size, setSize] = useState<WidgetSize>(WIDGETS.kpi.size);
  const [customs, setCustoms] = useState(customWidgets);
  const [saving, startSaving] = useTransition();
  // The builder's draft.
  const [draft, setDraft] = useState<WidgetModel>(newWidget("kpi", "draft"));
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);

  const custom =
    selection.mode === "custom"
      ? (customs.find((c) => c.id === selection.id) ?? null)
      : null;
  const type: WidgetType =
    selection.mode === "type"
      ? selection.type
      : selection.mode === "custom" && custom
        ? custom.widget.type
        : draft.type;
  const customData = useLiveData(load, custom?.widget ?? null);
  const draftData = useLiveData(
    load,
    selection.mode === "build" ? draft : null,
  );

  const types = WIDGET_TYPES.filter((x) => offeredOn(x, kind));
  const needle = query.trim().toLowerCase();
  const shown = types.filter(
    (x) =>
      !needle ||
      t(`type_${x}`).toLowerCase().includes(needle) ||
      t(`desc_${x}`).toLowerCase().includes(needle),
  );

  // Made-up numbers: every preview is filled at once and looks exactly
  // like the widget will, just with sample content.
  const words: SampleWords = {
    statuses: ([0, 1, 2, 3, 4] as const).map((i) =>
      t(`sampleStatus_${i}`),
    ) as SampleWords["statuses"],
    priorities: ([0, 1, 2, 3] as const).map((i) =>
      t(`samplePriority_${i}`),
    ) as SampleWords["priorities"],
    titles: ([0, 1, 2, 3, 4, 5] as const).map((i) => t(`sampleTitle_${i}`)),
    role: (key) => t(`sampleRole_${key}`),
    note: t("sampleNote"),
  };
  const preview: WidgetModel = custom
    ? {
        ...custom.widget,
        config: { ...custom.widget.config, title: custom.name },
      }
    : newWidget(type, "preview");
  const data = custom ? customData : sampleData(preview, words);

  const choose = (next: WidgetType) => {
    setSelection({ mode: "type", type: next });
    setSize(WIDGETS[next].size);
  };

  const chooseCustom = (entry: CustomWidgetEntry) => {
    setSelection({ mode: "custom", id: entry.id });
    setSize(entry.widget.size);
  };

  const startBuilding = (editing: CustomWidgetEntry | null) => {
    setDraft(editing ? editing.widget : newWidget("kpi", "draft"));
    setName(editing?.name ?? "");
    setShared(editing?.shared ?? false);
    setSelection({ mode: "build", editing });
  };

  const add = (chosen: WidgetSize = size) =>
    onAdd(
      custom
        ? {
            // A copy: later changes to the custom widget don't reach it.
            ...custom.widget,
            id: randomId().slice(0, 12),
            size: chosen,
            config: { ...custom.widget.config, title: custom.name },
          }
        : { ...newWidget(type, randomId().slice(0, 12)), size: chosen },
    );

  const saveDraft = (thenAdd: boolean) =>
    startSaving(async () => {
      const editing = selection.mode === "build" ? selection.editing : null;
      const result = await saveCustomWidget({
        id: editing?.id,
        workspaceId,
        name: name.trim(),
        widget: draft,
        shared,
      });
      if (!("ok" in result)) return;
      const entry = result.entry;
      setCustoms((list) =>
        [...list.filter((c) => c.id !== entry.id), entry].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      if (thenAdd) {
        onAdd({
          ...entry.widget,
          id: randomId().slice(0, 12),
          config: { ...entry.widget.config, title: entry.name },
        });
      } else {
        setSelection({ mode: "custom", id: entry.id });
        setSize(entry.widget.size);
      }
    });

  const remove = async (entry: CustomWidgetEntry) => {
    if (
      !(await confirm({
        title: t("customDelete"),
        description: t("customDeleteHint", { name: entry.name }),
        confirmLabel: t("remove"),
        cancelLabel: t("cancel"),
        danger: true,
      }))
    )
      return;
    const result = await deleteCustomWidget(entry.id);
    if (!("ok" in result)) return;
    setCustoms((list) => list.filter((c) => c.id !== entry.id));
    choose("kpi");
  };

  const mineOnly = customs.filter(
    (c) => !needle || c.name.toLowerCase().includes(needle),
  );

  return (
    <Modal
      width={960}
      variant={sheet ? "sheet" : "dialog"}
      className={styles.modal}
      style={sheet ? swipe.style : undefined}
      {...(sheet ? swipe.handlers : {})}
    >
      {sheet ? (
        <SheetHeader
          title={t("add")}
          onClose={close}
          closeLabel={t("cancel")}
        />
      ) : (
        <ModalHeader
          title={t("add")}
          leading={<Icon icon="lucide:layout-dashboard" width={16} />}
          onClose={close}
          closeLabel={t("cancel")}
        />
      )}

      <ModalBody ref={bodyRef} className={styles.body}>
        <nav className={styles.side} aria-label={t("kinds")}>
          <div className={styles.search}>
            <Input
              variant="search"
              value={query}
              placeholder={t("searchWidgets")}
              aria-label={t("searchWidgets")}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {GROUPS.map((group) => {
            const inGroup = shown.filter((x) => WIDGETS[x].group === group);
            if (inGroup.length === 0) return null;
            return (
              <div key={group} className={styles.group}>
                <span className={styles.groupLabel}>{t(`group_${group}`)}</span>
                {inGroup.map((x) => (
                  <button
                    key={x}
                    type="button"
                    className={styles.kind}
                    aria-current={
                      (selection.mode === "type" && x === type) || undefined
                    }
                    onClick={() => choose(x)}
                  >
                    <span
                      className={styles.kindIcon}
                      data-accent={WIDGETS[x].accent}
                    >
                      <Icon icon={WIDGETS[x].icon} width={14} />
                    </span>
                    {t(`type_${x}`)}
                  </button>
                ))}
              </div>
            );
          })}

          {/* Own widgets, at the bottom: the saved ones, then the builder. */}
          <div className={styles.group}>
            <span className={styles.groupLabel}>{t("group_custom")}</span>
            {mineOnly.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={styles.kind}
                aria-current={
                  (selection.mode === "custom" && selection.id === entry.id) ||
                  undefined
                }
                onClick={() => chooseCustom(entry)}
              >
                <span
                  className={styles.kindIcon}
                  data-accent={
                    entry.widget.config.accent ??
                    WIDGETS[entry.widget.type].accent
                  }
                >
                  <Icon icon={WIDGETS[entry.widget.type].icon} width={14} />
                </span>
                <span className={styles.kindName}>{entry.name}</span>
                {entry.shared && (
                  <Icon
                    icon="lucide:users"
                    width={12}
                    className={styles.kindMeta}
                    aria-label={t("customShared")}
                  />
                )}
              </button>
            ))}
            <button
              type="button"
              className={styles.newCustom}
              aria-current={selection.mode === "build" || undefined}
              onClick={() => startBuilding(null)}
            >
              <Icon icon="lucide:plus" width={14} />
              {t("customNew")}
            </button>
          </div>
        </nav>

        {selection.mode === "build" ? (
          <section className={styles.builder}>
            <div className={styles.builderForm}>
              <Input
                label={t("customName")}
                value={name}
                placeholder={t("customNamePlaceholder")}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
              />
              <fieldset className={styles.kindPick}>
                <legend>{t("customKind")}</legend>
                {BUILDER_TYPES.map((x) => (
                  <button
                    key={x}
                    type="button"
                    aria-pressed={draft.type === x}
                    onClick={() =>
                      setDraft((d) =>
                        d.type === x
                          ? d
                          : {
                              ...newWidget(x, "draft"),
                              config: {
                                ...WIDGETS[x].config,
                                filter: d.config.filter,
                                accent: d.config.accent,
                              },
                            },
                      )
                    }
                  >
                    <Icon icon={WIDGETS[x].icon} width={15} />
                    {t(`type_${x}`)}
                  </button>
                ))}
              </fieldset>
              <WidgetForm
                widget={draft}
                onChange={setDraft}
                title={name || t(`type_${draft.type}`)}
                lookups={lookups}
                area={area}
                sheet={sheet}
                hideTitle
              />
              <div className={styles.shareRow}>
                <span>
                  {t("customShare")}
                  <small>{t("customShareHint")}</small>
                </span>
                <Switch
                  checked={shared}
                  onChange={setShared}
                  label={t("customShare")}
                  labelHidden
                />
              </div>
            </div>
            <div className={styles.builderPreview}>
              <span
                className={styles.sizeChoice}
                data-size={draft.size}
                aria-hidden="true"
              >
                <span className={styles.frame} inert>
                  <span className={styles.real}>
                    <Widget
                      widget={{
                        ...draft,
                        config: {
                          ...draft.config,
                          title: name.trim() || undefined,
                        },
                      }}
                      data={draftData}
                      unit={unit}
                      issueBase={issueBase}
                      workspaceSlug={workspaceSlug}
                    />
                  </span>
                </span>
              </span>
              <p className={styles.previewDesc}>{t("customLive")}</p>
            </div>
          </section>
        ) : (
          <section className={styles.preview} aria-live="polite">
            <div>
              <h3 className={styles.previewTitle}>
                {custom ? custom.name : t(`type_${type}`)}
              </h3>
              <p className={styles.previewDesc}>
                {custom
                  ? custom.mine
                    ? t(`type_${type}`)
                    : t("customFromOthers", { kind: t(`type_${type}`) })
                  : t(`desc_${type}`)}
              </p>
            </div>
            <fieldset className={styles.sizes} aria-label={t("size")}>
              {WIDGETS[type].sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={s === size}
                  aria-label={t("addSized", { size: t(`size_${s}`) })}
                  className={styles.sizeChoice}
                  data-size={s}
                  // A click on a preview adds that widget in that size at once.
                  onClick={() => add(s)}
                  onFocus={() => setSize(s)}
                >
                  {/* Drawn at the dashboard's real size and scaled down, so
                    it shows exactly what that size shows there. */}
                  <span className={styles.frame} inert>
                    <span className={styles.real}>
                      <Widget
                        widget={{ ...preview, size: s }}
                        data={data}
                        unit={unit}
                        issueBase={issueBase}
                        workspaceSlug={workspaceSlug}
                      />
                    </span>
                  </span>
                  <span className={styles.sizeLabel}>{t(`size_${s}`)}</span>
                </button>
              ))}
            </fieldset>
          </section>
        )}
      </ModalBody>

      <ModalFooter>
        {selection.mode === "build" ? (
          <>
            <Button
              variant="ghost"
              onClick={() =>
                selection.editing
                  ? chooseCustom(selection.editing)
                  : choose("kpi")
              }
              disabled={saving}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="elevated"
              onClick={() => saveDraft(false)}
              disabled={saving || !name.trim()}
            >
              {t("save")}
            </Button>
            <Button
              variant="primary"
              icon={<Icon icon="lucide:plus" width={15} />}
              onClick={() => saveDraft(true)}
              disabled={saving || !name.trim()}
            >
              {t("customSaveAdd")}
            </Button>
          </>
        ) : (
          <>
            {custom?.mine && (
              <>
                <Button
                  variant="text"
                  className={styles.danger}
                  icon={<Icon icon="lucide:trash-2" width={14} />}
                  onClick={() => remove(custom)}
                >
                  {t("remove")}
                </Button>
                <Button
                  variant="elevated"
                  icon={<Icon icon="lucide:pencil" width={14} />}
                  onClick={() => startBuilding(custom)}
                >
                  {t("customEdit")}
                </Button>
              </>
            )}
            <span className={styles.footSpacer} />
            <Button variant="ghost" onClick={close}>
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              icon={<Icon icon="lucide:plus" width={15} />}
              onClick={() => add()}
            >
              {t("addSized", { size: t(`size_${size}`) })}
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
