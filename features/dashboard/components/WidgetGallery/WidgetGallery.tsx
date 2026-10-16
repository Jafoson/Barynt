"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Input } from "@/components/ui/atoms/Input/Input";
import { ModalFooter } from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import {
  newWidget,
  offeredOn,
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
}: Props) {
  const t = useTranslations("widgets");
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<WidgetType>("kpi");
  const [size, setSize] = useState<WidgetSize>(WIDGETS.kpi.size);

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
  };
  const base = newWidget(type, "preview");
  const preview: WidgetModel =
    type === "note"
      ? { ...base, config: { ...base.config, text: t("sampleNote") } }
      : base;
  const data = sampleData(preview, words);

  const choose = (next: WidgetType) => {
    setType(next);
    setSize(WIDGETS[next].size);
  };

  const add = () =>
    onAdd({ ...newWidget(type, randomId().slice(0, 12)), size });

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
