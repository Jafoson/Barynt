import { z } from "zod";
export default async function register() {
  return {
    plugin: "bundled-dep",
    parsed: z.object({ a: z.number() }).parse({ a: 2 }),
  };
}
