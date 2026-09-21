// Drives headless Chromium over the DevTools protocol: open a URL, wait until every
// plugin case on the spike page has finished loading, then print what is in the DOM
// and every console error. Used by run-browser.sh. Needs `chromium` and Bun.
//
//   bun browser.ts <url> [--timeout 30000]

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2];
if (!url) {
  console.error("usage: bun browser.ts <url> [--timeout ms]");
  process.exit(2);
}
const timeoutAt = process.argv.indexOf("--timeout");
const timeout = timeoutAt > 0 ? Number(process.argv[timeoutAt + 1]) : 30_000;

const port = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(tmpdir(), "chromium-spike-"));
const chromium = Bun.spawn(
  [
    "chromium",
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdout: "ignore", stderr: "ignore" },
);
const cleanup = () => {
  chromium.kill();
  rmSync(profile, { recursive: true, force: true });
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pageSocketUrl(): Promise<string> {
  for (let i = 0; i < 100; i++) {
    try {
      const targets = (await (
        await fetch(`http://127.0.0.1:${port}/json/list`)
      ).json()) as {
        type: string;
        webSocketDebuggerUrl: string;
      }[];
      const page = targets.find((target) => target.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  throw new Error("chromium did not start");
}

const socket = new WebSocket(await pageSocketUrl());
await new Promise((resolve) => {
  socket.onopen = resolve;
});

let nextId = 1;
const pending = new Map<number, (value: unknown) => void>();
const consoleErrors: string[] = [];

socket.onmessage = (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)?.(message.result);
    pending.delete(message.id);
    return;
  }
  if (
    message.method === "Runtime.consoleAPICalled" &&
    ["error", "warning"].includes(message.params.type)
  ) {
    consoleErrors.push(
      `${message.params.type}: ${message.params.args.map((a: { value?: string; description?: string }) => a.value ?? a.description).join(" ")}`,
    );
  }
  if (message.method === "Runtime.exceptionThrown") {
    consoleErrors.push(
      `exception: ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`,
    );
  }
  if (
    message.method === "Log.entryAdded" &&
    ["error", "warning"].includes(message.params.entry.level)
  ) {
    consoleErrors.push(
      `${message.params.entry.level}: ${message.params.entry.text} ${message.params.entry.url ?? ""}`,
    );
  }
};

function send(
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

async function evaluate<T>(expression: string): Promise<T> {
  const result = (await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })) as {
    result: { value: T };
  };
  return result.result.value;
}

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Page.navigate", { url });

// Ready = all six cases exist and none is still loading.
const READY = `(() => { const c = [...document.querySelectorAll('[data-case]')];
  return c.length >= 6 && c.every((e) => e.dataset.status !== 'loading'); })()`;

const started = Date.now();
let ready = false;
while (Date.now() - started < timeout) {
  ready = await evaluate<boolean>(READY);
  if (ready) break;
  await sleep(200);
}
await sleep(400); // let the effect in the good plugin run (count: 0 -> 1)

const summary = await evaluate<{
  importMap: boolean;
  path: string;
  soft: boolean;
  border: string | null;
  cases: { id: string; status: string; text: string }[];
}>(`(() => ({
  importMap: !!document.querySelector('script[type="importmap"]'),
  path: location.pathname,
  soft: window.__spikeEntry === true,
  border: (() => { const el = document.querySelector('.hello-client'); return el ? getComputedStyle(el).borderTopColor : null; })(),
  cases: [...document.querySelectorAll('[data-case]')].map((el) => ({
    id: el.dataset.case,
    status: el.dataset.status,
    text: (el.querySelector('[data-slot]')?.innerText || el.dataset.detail || '').replace(/\\s+/g, ' '),
  })),
}))()`);

console.log(
  `page: ${summary.path}   ready within ${Date.now() - started} ms: ${ready}`,
);
console.log(
  `import map in document: ${summary.importMap}   arrived by soft navigation: ${summary.soft}`,
);
console.log(
  `plugin css applied (hello-client border colour): ${summary.border ?? "no element"}`,
);
console.log(
  `\n${"case".padEnd(18)} ${"status".padEnd(13)} rendered text / error`,
);
for (const c of summary.cases)
  console.log(
    `${c.id.padEnd(18)} ${c.status.padEnd(13)} ${c.text.slice(0, 150)}`,
  );
console.log("\nconsole errors and warnings:");
if (consoleErrors.length === 0) console.log("  (none)");
for (const line of consoleErrors) console.log(`  ${line.slice(0, 200)}`);

socket.close();
cleanup();
process.exit(ready ? 0 : 1);
