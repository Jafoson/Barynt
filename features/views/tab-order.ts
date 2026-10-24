/**
 * A tab row in the person's own order (BARY-184): views with a place first,
 * by that place; the rest after them in the usual order — the system views
 * of the workspace (V8) ahead of everything else.
 */
export function tabOrder<
  T extends { systemKey: string | null; tabPosition: number | null },
>(views: T[]): T[] {
  const usual = [
    ...views.filter((v) => v.systemKey),
    ...views.filter((v) => !v.systemKey),
  ];
  return [
    ...usual
      .filter((v) => v.tabPosition !== null)
      .sort((a, b) => (a.tabPosition ?? 0) - (b.tabPosition ?? 0)),
    ...usual.filter((v) => v.tabPosition === null),
  ];
}
