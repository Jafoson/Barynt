import { version } from "@/package.json";

/**
 * The running Barynt, SemVer. `package.json` is the one place it is written, so
 * a release changes it there and nowhere else. Plugins match their `barynt`
 * range against it (`lib/plugins/resolve.ts`).
 */
export const BARYNT_VERSION: string = version;
