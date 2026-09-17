export interface Workspace {
  id: string;
  name: string;
  color: string;
  avatarUrl: string | null;
}

export interface SearchableIssue {
  id: string;
  key: number;
  title: string;
  status: string;
  project: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  prefix: string;
  color: string;
  avatarUrl: string | null;
  /** Which issue-detail fields this project has turned off (BARY-31) — raw
   *  strings from the database; resolve with `visibleDetailFields()`
   *  (`features/projects/detail-fields.ts`) rather than reading directly. */
  hiddenDetailFields: string[];
}

export interface Team {
  id: string;
  name: string;
  key: string;
  color: string;
  lead: string;
  members: string[];
  projects: string[];
  desc: string;
}
