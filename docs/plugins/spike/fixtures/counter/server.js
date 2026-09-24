// Edit STAMP between two requests to see whether a re-import sees the change.
export const STAMP = "A";
export default async function register() {
  return { plugin: "counter", stamp: STAMP };
}
