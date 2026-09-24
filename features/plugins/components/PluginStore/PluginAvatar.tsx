import type { CSSProperties } from "react";
import { hueOf, initials } from "@/features/plugins/storeView";
import styles from "./pluginStore.module.scss";

interface Props {
  id: string;
  name: string;
  /** In rem. */
  size?: number;
}

/**
 * A plugin's icon: its first letters on a colour that is the same for the same id. The
 * catalog carries no picture (a plugin's `icon` lies in its archive, and the page shows
 * what the store lists without downloading), so this is what every plugin has. The colour
 * is a value that has to come from the data, so it is the one thing set inline.
 */
export function PluginAvatar({ id, name, size = 2.5 }: Props) {
  return (
    <span
      className={styles.avatar}
      style={{ "--hue": hueOf(id), "--size": `${size}rem` } as CSSProperties}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
