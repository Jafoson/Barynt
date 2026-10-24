"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { ModalFooter } from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import { resetViewTabs, saveViewTabs } from "@/features/views/actions";
import { viewIconOf } from "@/features/views/icons";
import type { ViewLayout } from "@/features/views/schema";
import { useRouter } from "@/i18n/navigation";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import styles from "./viewTabs.module.scss";

/** What the editor needs of a view — a tab, or a card of the directory. */
export interface TabEntry {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  layout: ViewLayout;
  hidden: boolean;
  /** Who shared it — someone else's shared view only. */
  sharedBy: string | null;
}

interface ViewTabsEditorProps {
  /** Every view of the row, hidden ones included, in the row's order. */
  views: TabEntry[];
  /** Whose row this is — said in the hint. */
  scope: "project" | "workspace";
  close: () => void;
  /** A phone: a sheet, no "Cancel". */
  sheet: boolean;
}

/**
 * "Customize tabs" (BARY-184): which views the person's tab row shows, and
 * in which order — dragged by the grip or moved with the arrows, switched
 * off into "Hidden". Only for them; the views stay as they are for
 * everyone else.
 */
export function ViewTabsEditor({
  views,
  scope,
  close,
  sheet,
}: ViewTabsEditorProps) {
  const t = useTranslations("views.tabs");
  const tv = useTranslations("views");
  const tc = useTranslations("actions");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);

  const [order, setOrder] = useState(() =>
    views.filter((v) => !v.hidden).map((v) => v.id),
  );
  const [hidden, setHidden] = useState(() =>
    views.filter((v) => v.hidden).map((v) => v.id),
  );
  const byId = (id: string) => views.find((v) => v.id === id);

  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[index], next[to]] = [next[to], next[index]];
    setOrder(next);
  };
  const hide = (id: string) => {
    setOrder((cur) => cur.filter((x) => x !== id));
    setHidden((cur) => [...cur, id]);
  };
  const show = (id: string) => {
    setHidden((cur) => cur.filter((x) => x !== id));
    setOrder((cur) => [...cur, id]);
  };

  // Desktop: a row dragged by its grip to another place.
  const dragged = useRef<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const dropAt = (target: string) => {
    const id = dragged.current;
    dragged.current = null;
    setDropOn(null);
    if (!id || id === target) return;
    const next = order.filter((x) => x !== id);
    next.splice(next.indexOf(target), 0, id);
    setOrder(next);
  };

  const save = () =>
    startTransition(async () => {
      await saveViewTabs(order, hidden);
      router.refresh();
      close();
    });
  const reset = () =>
    startTransition(async () => {
      await resetViewTabs(views.map((v) => v.id));
      router.refresh();
      close();
    });

  const label = (id: string) => {
    const view = byId(id);
    if (!view) return null;
    return (
      <>
        <Icon
          icon={viewIconOf(view)}
          width={15}
          className={styles.editIcon}
          style={view.color ? { color: view.color } : undefined}
        />
        <span className={styles.editName}>
          {view.name}
          {view.sharedBy && (
            <span className={styles.editNote}>
              {" · "}
              {tv("sharedBy", { name: view.sharedBy })}
            </span>
          )}
        </span>
      </>
    );
  };

  return (
    <Modal
      variant={sheet ? "sheet" : "dialog"}
      width={520}
      style={sheet ? swipe.style : undefined}
      {...(sheet ? swipe.handlers : {})}
    >
      {sheet ? (
        <SheetHeader
          title={t("customizeTabs")}
          onClose={close}
          closeLabel={tc("close")}
        />
      ) : (
        <ModalHeader
          title={t("customizeTabs")}
          leading={<Icon icon="lucide:sliders-horizontal" width={16} />}
          onClose={close}
          closeLabel={tc("close")}
        />
      )}
      <ModalBody ref={bodyRef}>
        <p className={styles.editHint}>
          {t(scope === "project" ? "tabsHintProject" : "tabsHintWorkspace")}
        </p>
        <span className={styles.editHead}>{t("tabsShown")}</span>
        <ul className={styles.editList}>
          {order.map((id, index) => (
            <li
              key={id}
              className={styles.editRow}
              data-drop={dropOn === id || undefined}
              draggable={!sheet}
              onDragStart={(e) => {
                dragged.current = id;
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!dragged.current) return;
                e.preventDefault();
                if (dropOn !== id) setDropOn(id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropAt(id);
              }}
              onDragEnd={() => {
                dragged.current = null;
                setDropOn(null);
              }}
            >
              {!sheet && (
                <Icon
                  icon="lucide:grip-vertical"
                  width={15}
                  className={styles.editGrip}
                  aria-hidden="true"
                />
              )}
              {label(id)}
              <Button
                variant="ghost"
                size="sm"
                icon={<Icon icon="lucide:chevron-up" width={14} />}
                aria-label={t("moveTabEarlier")}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              />
              <Button
                variant="ghost"
                size="sm"
                icon={<Icon icon="lucide:chevron-down" width={14} />}
                aria-label={t("moveTabLater")}
                disabled={index === order.length - 1}
                onClick={() => move(index, 1)}
              />
              <Switch
                checked
                onChange={() => hide(id)}
                label={byId(id)?.name ?? ""}
                labelHidden
              />
            </li>
          ))}
          {order.length === 0 && (
            <li className={styles.editEmpty}>{t("tabsNoneShown")}</li>
          )}
        </ul>
        {hidden.length > 0 && (
          <>
            <span className={styles.editHead}>{t("tabsHidden")}</span>
            <ul className={styles.editList}>
              {hidden.map((id) => (
                <li key={id} className={styles.editRow} data-off>
                  {label(id)}
                  <Switch
                    checked={false}
                    onChange={() => show(id)}
                    label={byId(id)?.name ?? ""}
                    labelHidden
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </ModalBody>
      <ModalFooter
        hint={
          <Button variant="ghost" onClick={reset} disabled={pending}>
            {t("tabsReset")}
          </Button>
        }
      >
        <Button variant="primary" onClick={save} disabled={pending}>
          {t("done")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
