"use client";

import { Icon } from "@iconify/react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { NavLink } from "@/components/ui/layout/NavLink/NavLink";
import { reorderFavorites } from "@/features/views/actions";
import { useRouter } from "@/i18n/navigation";
import { useNavAction } from "../components/TabList";
import styles from "../components/tabList.module.scss";

export interface FavoriteItem {
  kind: "view" | "project";
  id: string;
  label: string;
  href: string;
  /** A view's project, after its name. */
  hint?: string;
  icon?: string;
  color?: string;
  image?: string;
}

/**
 * The favorites as a list that sorts by dragging (V7). The new order shows
 * at once and is stored behind it; a hover button unstars.
 */
export function FavoritesList({
  items,
  unfavoriteLabel,
}: {
  items: FavoriteItem[];
  unfavoriteLabel: string;
}) {
  const router = useRouter();
  const runAction = useNavAction();
  const [, startTransition] = useTransition();
  // The order as last dragged — reset whenever the server sends a new list.
  const [order, setOrder] = useState(items);
  const [source, setSource] = useState(items);
  if (source !== items) {
    setSource(items);
    setOrder(items);
  }
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const drop = (to: number) => {
    if (dragging === null || dragging === to) return;
    const next = [...order];
    const [moved] = next.splice(dragging, 1);
    next.splice(to, 0, moved);
    setOrder(next);
    startTransition(async () => {
      const result = await reorderFavorites(
        next.map(({ kind, id }) => ({ kind, id })),
      );
      if (result.ok) router.refresh();
    });
  };

  return (
    <div className={styles.tabList}>
      {order.map((item, i) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: drag & drop is a pointer shortcut; the order is also the list's reading order
        <div
          key={`${item.kind}:${item.id}`}
          className={styles.item}
          draggable
          data-dragging={dragging === i || undefined}
          data-over={
            over === i && dragging !== i
              ? dragging !== null && dragging < i
                ? "after"
                : "before"
              : undefined
          }
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            setDragging(i);
          }}
          onDragOver={(e) => {
            if (dragging === null) return;
            e.preventDefault();
            setOver(i);
          }}
          onDrop={(e) => {
            e.preventDefault();
            drop(i);
            setDragging(null);
            setOver(null);
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
        >
          <div className={styles.row}>
            <NavLink
              href={item.href}
              label={item.hint ? `${item.label} · ${item.hint}` : item.label}
              icon={item.icon}
              color={item.color}
              image={item.image}
              shape={item.kind === "project" ? "square" : undefined}
            />
            <span className={styles.action}>
              <Button
                type="button"
                variant="text"
                icon={<Icon icon="lucide:star-off" width={14} />}
                aria-label={unfavoriteLabel}
                title={unfavoriteLabel}
                onClick={() =>
                  runAction({
                    kind:
                      item.kind === "view"
                        ? "unfavoriteView"
                        : "unfavoriteProject",
                    id: item.id,
                  })
                }
              />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
