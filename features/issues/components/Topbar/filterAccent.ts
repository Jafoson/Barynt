import type { FilterKey } from "./useTopbar";

/** Each filter's own outline color while it's set — the desktop chips and
 *  the chips in the tablet/phone popup alike. */
export const FILTER_ACCENT: Record<FilterKey, string> = {
  status: "var(--primary)",
  type: "var(--tertiary)",
  priority: "var(--amber)",
  assignee: "var(--purple)",
  label: "var(--blue)",
  project: "var(--green)",
  storyPoints: "var(--secondary)",
  dueDate: "var(--red)",
};
