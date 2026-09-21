// A plugin must not reach into host internals. This should fail loudly.
import { db } from "@/lib/db";
export default async function register() {
  return { plugin: "imports-host", db: typeof db };
}
