import { NextResponse } from "next/server";

// Liveness: the process is up and answering. Deliberately touches nothing
// else — if it checked the database, a database outage would make
// Kubernetes restart every app pod in a loop, which fixes nothing and makes
// the recovery slower. Readiness (`/api/health`) is the one that cares.

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
