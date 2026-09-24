// When a store's clone is brought up to date without anyone asking: when the store page is
// opened and the state is old. Pure, so the rule is tested without a clock or a database.
// Whoever presses "update" is not asked any of this; it is only about the automatic one.

/** How old the state of a store may be before opening the page fetches it again. */
export const DEFAULT_MAX_AGE_HOURS = 6;
/** The longest it can be set to, so a typo cannot mean "never". */
export const MAX_MAX_AGE_HOURS = 24 * 30;
/** After an attempt, successful or not, the next automatic one waits this long. */
export const RETRY_AFTER_MS = 10 * 60 * 1000;

export interface SyncConfig {
  /** Whether opening the store page may fetch at all. */
  auto: boolean;
  maxAgeMs: number;
}

/**
 * The settings from the environment: `BARYNT_STORE_AUTO_SYNC=off` (also `false`, `0`, `no`)
 * for an instance that must not reach out unless an admin presses the button, and
 * `BARYNT_STORE_MAX_AGE_HOURS` for how old a state may be. A value that is no number in
 * range is the default, not an error: nobody has to set either.
 */
export function syncConfig(
  env: Record<string, string | undefined>,
): SyncConfig {
  const auto = !["off", "false", "0", "no"].includes(
    (env.BARYNT_STORE_AUTO_SYNC ?? "").trim().toLowerCase(),
  );
  // `Number` reads spaces around a number, and an empty value as 0, which is no age.
  const hours = Number(env.BARYNT_STORE_MAX_AGE_HOURS ?? "");
  const valid = hours > 0 && hours <= MAX_MAX_AGE_HOURS;
  return {
    auto,
    maxAgeMs: (valid ? hours : DEFAULT_MAX_AGE_HOURS) * 60 * 60 * 1000,
  };
}

export type SyncDue = "never" | "stale" | null;

/**
 * Whether a store is to be fetched now. `"never"` for one that has no successful sync, which
 * the page waits for (there is nothing to show without it), `"stale"` for one that has an old
 * state, which is fetched after the page is sent. `null` for one that is fresh enough, or was
 * tried too recently: a store that cannot be reached is not asked again on every visit.
 */
export function syncDue(
  store: { syncedAt: Date | null; syncAttemptedAt: Date | null },
  config: SyncConfig,
  now: Date,
): SyncDue {
  if (!config.auto) return null;
  if (
    store.syncAttemptedAt !== null &&
    now.getTime() - store.syncAttemptedAt.getTime() < RETRY_AFTER_MS
  ) {
    return null;
  }
  if (store.syncedAt === null) return "never";
  return now.getTime() - store.syncedAt.getTime() > config.maxAgeMs
    ? "stale"
    : null;
}
