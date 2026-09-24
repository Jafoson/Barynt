// Imports a package the host also ships. Does bare-specifier resolution find it
// from the plugin directory, or only when the directory sits below /app?
import { z } from "zod";
export default async function register() {
  return {
    plugin: "needs-zod",
    parsed: z.object({ a: z.number() }).parse({ a: 1 }),
  };
}
