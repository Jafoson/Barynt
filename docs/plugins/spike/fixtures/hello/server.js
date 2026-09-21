// Plain ESM, no imports: the simplest possible plugin server module.
export const version = "1.0.0";
export default async function register(ctx) {
  return {
    plugin: "hello",
    host: ctx.host,
    loadedAt: new Date().toISOString(),
  };
}
