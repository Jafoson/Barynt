import type { StatusCategory } from "./status-category";

export const DEFAULT_STATUSES: {
  id: string;
  name: string;
  short: string;
  color: string;
  isColumn: boolean;
  position: number;
  category: StatusCategory;
}[] = [
  {
    id: "backlog",
    name: "Backlog",
    short: "Backlog",
    color: "#8a9099",
    isColumn: true,
    position: 0,
    category: "backlog",
  },
  {
    id: "todo",
    name: "Todo",
    short: "Todo",
    color: "#b8bcc4",
    isColumn: true,
    position: 1,
    category: "unstarted",
  },
  {
    id: "in_progress",
    name: "In Progress",
    short: "Progress",
    color: "#e2b340",
    isColumn: true,
    position: 2,
    category: "started",
  },
  {
    id: "in_review",
    name: "In Review",
    short: "Review",
    color: "#5b9bd5",
    isColumn: true,
    position: 3,
    category: "started",
  },
  {
    id: "done",
    name: "Done",
    short: "Done",
    color: "#5ab98a",
    isColumn: true,
    position: 4,
    category: "completed",
  },
  {
    id: "canceled",
    name: "Canceled",
    short: "Canceled",
    color: "#7a7f87",
    isColumn: false,
    position: 5,
    category: "canceled",
  },
];

export const DEFAULT_PRIORITIES = [
  { id: 0, key: "none", name: "No priority", color: "#8a9099", position: 0 },
  { id: 1, key: "low", name: "Low", color: "#3b9d6e", position: 1 },
  { id: 2, key: "medium", name: "Medium", color: "#e2b340", position: 2 },
  { id: 3, key: "high", name: "High", color: "#d5733b", position: 3 },
  { id: 4, key: "urgent", name: "Urgent", color: "#e05252", position: 4 },
];

export const DEFAULT_ISSUE_TYPES = [
  { id: "feature", name: "Feature", color: "#6e63e6", position: 0 },
  { id: "bug", name: "Bug", color: "#e5664a", position: 1 },
  { id: "improvement", name: "Improvement", color: "#3b9d6e", position: 2 },
  { id: "task", name: "Task", color: "#3b7bd5", position: 3 },
  { id: "chore", name: "Chore", color: "#8a7f6b", position: 4 },
];

// Default roles & permissions live in lib/rbac.ts (single source of truth)
// and are created per workspace via lib/rbac-provision.ts.
