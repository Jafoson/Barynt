/**
 * Quick-filter presets for the story points topbar filter (BARY-4) —
 * Fibonacci, the convention most agile teams already use. Setting a story
 * point value on an issue itself is a free integer field (a plain number
 * input, not this list): `Issue.storyPoints` has no schema-level enum, no
 * per-workspace catalog like `priority`/`status`/`type` get, and a team
 * that doesn't estimate on the Fibonacci scale shouldn't be boxed into it.
 * This list only saves the filter from being "type an exact number" —
 * it doesn't limit what a value can be.
 */
export const STORY_POINTS_OPTIONS = [1, 2, 3, 5, 8, 13] as const;
