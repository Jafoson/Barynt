"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { ModalFooter } from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import type { WidgetData } from "@/features/dashboard/types";
import { WIDGETS, type Widget } from "@/features/dashboard/widgets";
import type { FilterLabelLookups } from "@/features/issues/components/Topbar/filterLabels";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import { WidgetForm } from "../WidgetForm/WidgetForm";
import styles from "./widgetSettings.module.scss";

interface Props {
  widget: Widget;
  /** What the widget shows right now — the shortcuts it can choose from. */
  data: WidgetData | undefined;
  /** What the widget is called right now — the title field's placeholder. */
  title: string;
  lookups: FilterLabelLookups;
  area: "project" | "my";
  sheet: boolean;
  /** Every change applies at once — the dashboard behind redraws live. */
  onChange: (widget: Widget) => void;
  onRemove: () => void;
  onMove: (by: -1 | 1) => void;
  close: () => void;
}

/**
 * A widget's settings — the side panel (a sheet on a phone) that opens on a
 * click in edit mode. What it offers depends on the kind: what a number
 * counts, what a chart groups by, how a list sorts; then for every kind
 * that reads issues its own filter, for charts the labels, and for all the
 * background and accent.
 */
export function WidgetSettings({
  widget: initial,
  data,
  title,
  lookups,
  area,
  sheet,
  onChange,
  onRemove,
  onMove,
  close,
}: Props) {
  const t = useTranslations("widgets");
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);
  const [widget, setWidget] = useState(initial);
  const def = WIDGETS[widget.type];

  const apply = (next: Widget) => {
    setWidget(next);
    onChange(next);
  };

  return (
    <Modal
      variant={sheet ? "sheet" : "panel"}
      width={380}
      style={sheet ? swipe.style : undefined}
      {...(sheet ? swipe.handlers : {})}
    >
      {sheet ? (
        <SheetHeader title={title} onClose={close} closeLabel={t("done")} />
      ) : (
        <ModalHeader
          title={title}
          leading={<Icon icon={def.icon} width={16} />}
          onClose={close}
          closeLabel={t("done")}
        />
      )}

      <ModalBody ref={bodyRef} className={styles.body}>
        <WidgetForm
          widget={widget}
          onChange={apply}
          title={title}
          lookups={lookups}
          area={area}
          sheet={sheet}
          data={data}
        />
      </ModalBody>

      <ModalFooter>
        <span className={styles.moves}>
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon icon="lucide:arrow-left" width={15} />}
            aria-label={t("moveEarlier")}
            title={t("moveEarlier")}
            onClick={() => onMove(-1)}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon icon="lucide:arrow-right" width={15} />}
            aria-label={t("moveLater")}
            title={t("moveLater")}
            onClick={() => onMove(1)}
          />
        </span>
        <Button
          variant="text"
          size="sm"
          className={styles.danger}
          icon={<Icon icon="lucide:trash-2" width={14} />}
          onClick={onRemove}
        >
          {t("remove")}
        </Button>
        <Button variant="primary" size="sm" onClick={close}>
          {t("done")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
