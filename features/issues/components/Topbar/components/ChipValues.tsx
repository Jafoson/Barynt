import styles from "../topbar.module.scss";

/** How many values a filter chip spells out before "+N" (BARY-177). */
export const SHOWN_VALUES = 2;

/**
 * A set filter's chip text: "Label: Bug, Frontend +1". The field name stays
 * in front so the row reads without opening anything; past two values the
 * rest is counted, and the full list is the chip's tooltip (`chipTitle`).
 */
export function ChipValues({
  name,
  values,
}: {
  name: string;
  values: string[];
}) {
  const shown = values.slice(0, SHOWN_VALUES);
  const rest = values.length - shown.length;
  return (
    <>
      <span className={styles.chipKey}>{name}:</span> {shown.join(", ")}
      {rest > 0 && <span className={styles.chipMore}> +{rest}</span>}
    </>
  );
}

/** The full selection, for the chip's tooltip. */
export function chipTitle(name: string, values: string[]): string {
  return `${name}: ${values.join(", ")}`;
}

/** The icons of the first values a chip spells out, side by side. */
export function ChipIcons({ children }: { children: React.ReactNode[] }) {
  return (
    <span className={styles.chipIcons}>{children.slice(0, SHOWN_VALUES)}</span>
  );
}
