import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Builds the GitHub Actions job summary from what `scripts/run-tests.ts`
 * writes to `test-results/`: one JUnit XML (structured pass/fail/skip/time
 * per test) and one raw console log (Bun's `<failure>` elements carry no
 * message, so the actual error text only exists in the console output) per
 * segment.
 *
 * Matching a log block to its test doesn't rely on file order — the label
 * Bun prints on its `(fail) <describe path> > <name> [<time>]` line is
 * reconstructed from the XML (`classname`, reversed, plus `name`) and used
 * as the lookup key, so segments and grouping can change without this
 * breaking.
 */

interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

function parseXml(xml: string): XmlNode {
  const tokenRe = /<(\/?)([\w-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  const attrRe = /([\w:-]+)="([^"]*)"/g;
  const root: XmlNode = { tag: "#root", attrs: {}, children: [] };
  const stack: XmlNode[] = [root];

  for (const match of xml.matchAll(tokenRe)) {
    const [, closing, tag, attrsRaw, selfClosing] = match;
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const am of attrsRaw.matchAll(attrRe)) {
      // Bun double-escapes the " > " it joins nested `describe()` names
      // with (e.g. `classname="a &amp;gt; b"`) — unescaping twice fixes
      // that and is a no-op for attributes that were only escaped once.
      attrs[am[1]] = unescapeXml(unescapeXml(am[2]));
    }
    const node: XmlNode = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

interface TestCase {
  label: string;
  name: string;
  time: number;
  status: "pass" | "fail" | "skip";
  detail?: string;
}

interface FileResult {
  name: string;
  tests: TestCase[];
}

function collectTestcases(node: XmlNode, out: TestCase[]) {
  for (const child of node.children) {
    if (child.tag === "testsuite") {
      collectTestcases(child, out);
    } else if (child.tag === "testcase") {
      const classname = child.attrs.classname ?? "";
      // Bun writes the describe chain innermost-first ("inner > outer");
      // reverse it so labels read the way Bun's own console output does.
      const describePath = classname
        ? classname.split(" > ").reverse().join(" > ")
        : "";
      const name = child.attrs.name ?? "";
      const label = describePath ? `${describePath} > ${name}` : name;
      const status = child.children.some((c) => c.tag === "failure")
        ? "fail"
        : child.children.some((c) => c.tag === "skipped")
          ? "skip"
          : "pass";
      out.push({
        label,
        name,
        time: Number(child.attrs.time ?? 0),
        status,
      });
    }
  }
}

const dir = "test-results";
const parts = readdirSync(dir)
  .filter((f) => f.endsWith(".xml"))
  .sort();

const files: FileResult[] = [];
const byLabel = new Map<string, TestCase>();

for (const part of parts) {
  const xml = readFileSync(join(dir, part), "utf8");
  const root = parseXml(xml);
  const suites = root.children[0]?.children ?? []; // children of <testsuites>
  for (const fileSuite of suites) {
    if (fileSuite.tag !== "testsuite") continue;
    const cases: TestCase[] = [];
    collectTestcases(fileSuite, cases);
    for (const c of cases) byLabel.set(c.label, c);
    files.push({
      name: fileSuite.attrs.file ?? fileSuite.attrs.name,
      tests: cases,
    });
  }

  const logPath = join(dir, part.replace(/\.xml$/, ".log"));
  let log: string;
  try {
    log = readFileSync(logPath, "utf8");
  } catch {
    continue;
  }
  attachFailureDetail(log, byLabel);
}

/** Bun prints failure detail to stderr, ending in `(fail) <label> [<time>]`. */
function attachFailureDetail(log: string, index: Map<string, TestCase>) {
  const markerRe = /^\(fail\) (.+) \[[^\]]+\]\s*$/;
  const fileHeaderRe = /^[\w./-]+\.tsx?:$/;
  const otherMarkerRe = /^\((pass|skip)\) .+ \[[^\]]+\]\s*$/;

  let buffer: string[] = [];
  for (const line of log.split("\n")) {
    const failMatch = line.match(markerRe);
    if (failMatch) {
      const testCase = index.get(failMatch[1]);
      const detail = buffer.join("\n").trim();
      if (testCase && detail) testCase.detail = detail;
      buffer = [];
      continue;
    }
    if (otherMarkerRe.test(line)) {
      buffer = [];
      continue;
    }
    if (fileHeaderRe.test(line.trim())) continue;
    buffer.push(line);
  }
}

const totals = { tests: 0, failures: 0, skipped: 0, time: 0 };
for (const f of files) {
  for (const t of f.tests) {
    totals.tests++;
    totals.time += t.time;
    if (t.status === "fail") totals.failures++;
    if (t.status === "skip") totals.skipped++;
  }
}

function fmtTime(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  return `${seconds.toFixed(2)}s`;
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|");
}

const lines: string[] = ["## Testergebnisse", ""];
lines.push(
  totals.failures > 0
    ? `❌ **${totals.failures} von ${totals.tests} Tests fehlgeschlagen** — ${fmtTime(totals.time)}`
    : `✅ **${totals.tests} Tests bestanden**${totals.skipped ? `, ${totals.skipped} übersprungen` : ""} — ${fmtTime(totals.time)}`,
);
lines.push("");

for (const f of files) {
  const fileFailures = f.tests.filter((t) => t.status === "fail").length;
  const fileSkipped = f.tests.filter((t) => t.status === "skip").length;
  const fileTime = f.tests.reduce((sum, t) => sum + t.time, 0);
  const icon = fileFailures > 0 ? "❌" : fileSkipped > 0 ? "⚠️" : "✅";

  lines.push("<details>");
  lines.push(
    `<summary>${icon} <code>${f.name}</code> — ${f.tests.length} Tests, ${fmtTime(fileTime)}</summary>`,
  );
  lines.push("");
  // Table cells stay single-line (GFM breaks on multi-line/fenced content
  // in a table cell) — failure detail goes below the table instead.
  lines.push("| | Test | Dauer |", "|---|---|---|");
  for (const t of f.tests) {
    const testIcon =
      t.status === "fail" ? "❌" : t.status === "skip" ? "⚠️" : "✅";
    lines.push(`| ${testIcon} | ${escapeMd(t.label)} | ${fmtTime(t.time)} |`);
  }
  for (const t of f.tests) {
    if (!t.detail) continue;
    lines.push("", `**Fehler in \`${escapeMd(t.label)}\`:**`, "");
    lines.push("```", t.detail, "```");
  }
  lines.push("");
  lines.push("</details>");
}

const output = `${lines.join("\n")}\n`;
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  appendFileSync(summaryPath, output);
} else {
  console.log(output);
}
