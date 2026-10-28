import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/app-info";
import { db } from "@/lib/db";

// Readiness: the app can serve requests — its database answers. Used by the
// installer, the compose healthcheck and the Helm chart's readiness/startup
// probes. Migrations run before the server starts (`docker/entrypoint.sh`),
// so a server that answers here has its schema in place too.
//
// Public on purpose, like any health check: it says "ok" and a version, no
// detail an attacker could use. `/api` is outside the auth proxy anyway.

export const dynamic = "force-dynamic";

/** A hung connection shouldn't hang the probe — Kubernetes would wait for
 *  its own timeout and learn nothing. */
const DB_TIMEOUT_MS = 3000;

async function databaseReady(): Promise<boolean> {
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const database = await databaseReady();
  return NextResponse.json(
    {
      status: database ? "ok" : "unavailable",
      version: APP_VERSION,
      checks: { database: database ? "ok" : "unavailable" },
    },
    {
      status: database ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
