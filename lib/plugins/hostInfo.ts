import { SDK_VERSION } from "@barynt/plugin-sdk";
import { BARYNT_VERSION } from "@/lib/version";

/** The versions of the host a plugin is told about: `ctx.host`. */
export const HOST_INFO = Object.freeze({
  barynt: BARYNT_VERSION,
  sdk: SDK_VERSION,
});
