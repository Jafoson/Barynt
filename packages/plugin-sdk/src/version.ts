/**
 * Version of the SDK contract, SemVer. The host reports it to plugins as
 * `ctx.host.sdk`. It has to match `package.json` (a test checks that).
 *
 * Before 1.0 anything may change. From 1.0 on only additive changes: a name is
 * removed only after it was deprecated for at least one release.
 */
export const SDK_VERSION = "0.3.0";
