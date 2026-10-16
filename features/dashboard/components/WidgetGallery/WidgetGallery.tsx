"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { ModalFooter } from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import type { WidgetData, WidgetDataMap } from "@/features/dashboard/types";
import {
  newWidget,
  WIDGET_TYPES,
  WIDGETS,
  type Widget as WidgetModel,
  type WidgetSize,
  type WidgetType,
} from "@/features/dashboard/widgets";
import type { BucketUnit } from "@/lib/buckets";
import { randomId } from "@/lib/utils/id";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import { Widget } from "../Widget/Widget";
import styles from "./widgetGallery.module.scss";

interface Props {
  /** Fetches data for widgets of this dashboard — the previews are real. */
  load: (widgets: WidgetModel[]) => Promise<WidgetDataMap | null>;
  unit: BucketUnit;
  issueBase: string;
  workspaceSlug: string;
  kind: "project" | "workspace" | "view";
  sheet: boolean;
  /** Adds the widget; the preview's data comes along so it shows at once. */
  onAdd: (widget: WidgetModel, data: WidgetData | undefined) => void;
  close: () => void;
}

const GROUPS = ["numbers", "charts", "lists", "other"] as const;

/**
 * "Add widget", like the widget gallery on iPhone and Mac: the kinds on
 * the left, the chosen one on the right in every size it offers — with this
 * dashboard's real numbers. Pick a size, add.
 */
export function WidgetGallery({
  load,
  unit,
  issueBase,
  workspaceSlug,
  kind,
  sheet,
  onAdd,
  close,
}: Props) {
  const t = useTranslations("widgets");
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<WidgetType>("kpi");
  const [size, setSize] = useState<WidgetSize>(WIDGETS.kpi.size);
  const [previews, setPreviews] = useState<
    Partial<Record<WidgetType, WidgetData>>
  >({});

  // A view's dashboard has no project to describe.
  const types = WIDGET_TYPES.filter((x) => kind !== "view" || x !== "about");
  const needle = query.trim().toLowerCase();
  const shown = types.filter(
    (x) =>
      !needle ||
      t(`type_${x}`).toLowerCase().includes(needle) ||
      t(`desc_${x}`).toLowerCase().includes(needle),
  );

  const preview = newWidget(type, "preview");

  useEffect(() => {
    if (previews[type]) return;
    let live = true;
    void load([newWidget(type, "preview")]).then((data) => {
      const found = data?.preview;
      if (live && found)
        setPreviews((current) => ({ ...current, [type]: found }));
    });
    return () => {
      live = false;
    };
  }, [type, previews, load]);

  const choose = (next: WidgetType) => {
    setType(next);
    setSize(WIDGETS[next].size);
  };

  const add = () =>
    onAdd(
      { ...newWidget(type, randomId().slice(0, 12)), size },
      previews[type],
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
          <input
            className={styles.search}
            type="search"
            value={query}
            placeholder={t("searchWidgets")}
            aria-label={t("searchWidgets")}
            onChange={(e) => setQuery(e.target.value)}
          />
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
                    aria-current={x === type || undefined}
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
        </nav>

        <section className={styles.preview} aria-live="polite">
          <div>
            <h3 className={styles.previewTitle}>{t(`type_${type}`)}</h3>
            <p className={styles.previewDesc}>{t(`desc_${type}`)}</p>
          </div>
          <fieldset className={styles.sizes} aria-label={t("size")}>
            {WIDGETS[type].sizes.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={s === size}
                className={styles.sizeChoice}
                data-size={s}
                onClick={() => setSize(s)}
              >
                <span className={styles.frame} inert>
                  <Widget
                    widget={{ ...preview, size: s }}
                    data={previews[type]}
                    unit={unit}
                    issueBase={issueBase}
                    workspaceSlug={workspaceSlug}
                  />
                </span>
                <span className={styles.sizeLabel}>{t(`size_${s}`)}</span>
              </button>
            ))}
          </fieldset>
        </section>
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={close}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          icon={<Icon icon="lucide:plus" width={15} />}
          onClick={add}
        >
          {t("addSized", { size: t(`size_${size}`) })}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
