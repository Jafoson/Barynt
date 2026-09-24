import { createElement } from "react";
export default async function register() {
  return { plugin: "needs-react", element: typeof createElement };
}
