import { Icon } from "@iconify/react";
import type { FieldOption } from "@/lib/custom-fields";
import styles from "./optionVisual.module.scss";

interface Props {
  option: Pick<FieldOption, "icon" | "imageUrl" | "color">;
  size?: number;
  /**
   * Draw the colour as a dot when there is no icon or image. Off where the
   * surrounding chip already draws its own dot from the same colour.
   */
  showColor?: boolean;
}

/**
 * What stands in front of a choice: its uploaded image if it has one, else
 * its icon, else a dot in its colour, else nothing. Used wherever a choice is
 * shown — menus, chips, card values, group headers — so it never looks two
 * ways.
 */
export function OptionVisual({ option, size = 16, showColor = true }: Props) {
  if (option.imageUrl) {
    return (
      // biome-ignore lint/performance/noImgElement: a presigned storage URL, not something next/image can optimise
      <img
        src={option.imageUrl}
        alt=""
        width={size}
        height={size}
        className={styles.image}
      />
    );
  }
  if (option.icon) {
    return (
      <Icon
        icon={option.icon}
        width={size}
        className={styles.icon}
        style={option.color ? { color: option.color } : undefined}
        aria-hidden="true"
      />
    );
  }
  if (showColor && option.color) {
    const dot = Math.max(8, Math.round(size * 0.55));
    return (
      <span
        className={styles.dot}
        style={{ width: dot, height: dot, background: option.color }}
        aria-hidden="true"
      />
    );
  }
  return null;
}
