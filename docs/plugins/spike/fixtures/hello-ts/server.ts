// TypeScript straight from disk, no build step: does the runtime transpile it?
interface Ctx {
  host: string;
}
export default async function register(
  ctx: Ctx,
): Promise<{ plugin: string; host: string }> {
  return { plugin: "hello-ts", host: ctx.host };
}
