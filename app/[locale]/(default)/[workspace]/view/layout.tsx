import styles from "./layout.module.scss";

// As with the project: each page renders its own topbar — only it knows the
// count of filtered issues on its tab. This layout only holds the column
// together (topbar on top, the rest scrolls).
export default function WorkspaceAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={styles.wrapper}>{children}</div>;
}
