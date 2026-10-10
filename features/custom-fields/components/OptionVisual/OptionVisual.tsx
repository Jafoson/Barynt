import { Icon } from "@iconify/react";
import type { FieldOption } from "@/lib/custom-fields";
import styles from "./optionVisual.module.scss";

interface Props {
  option: Pick<FieldOption, "icon" | "imageUrl">;
  size?: number;
}

/**
 * The picture in front of a choice: its uploaded image if it has one, else
 * its icon, else nothing. Used wherever a choice is shown — menus, chips,
 * card values, group headers — so it never looks two ways.
 */
export function OptionVisual({ option, size = 16 }: Props) {
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
        aria-hidden="true"
      />
    );
  }
  return null;
}
