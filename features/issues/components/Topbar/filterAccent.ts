import type { FilterKey } from "./useTopbar";

/** Each filter's own outline color while it's set — the desktop chips, the
 *  chips in the tablet/phone popup and the conditions of the group row alike.
 *  Never primary or secondary: those mean "selected" and "action". */
export const FILTER_ACCENT: Record<FilterKey, string> = {
  status: "var(--teal)",
  type: "var(--tertiary)",
  priority: "var(--orange)",
  assignee: "var(--purple)",
  label: "var(--blue)",
  project: "var(--green)",
  storyPoints: "var(--lime)",
  dueDate: "var(--indigo)",
};
