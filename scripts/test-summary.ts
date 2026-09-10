import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Builds the GitHub Actions job summary from the JUnit files `bun run test`
 * writes to `test-results/`. `dorny/test-reporter` can't be used here: Bun
 * nests each `describe()` as its own `<testsuite>` instead of flattening to
 * `<testcase>`, which its parser reads as "no tests found". This reads the
 * per-file `<testsuite>` line directly instead (still one level of nesting
 * in, so it also excludes the root `<testsuites>` summary line and the
 * per-`describe` ones further in).
 */

interface FileResult {
  name: string;
  tests: number;
  failures: number;
  skipped: number;
}

const dir = "test-results";
const fileSuiteRe =
  /^ {2}<testsuite name="([^"]*)" file="[^"]*" tests="(\d+)" assertions="\d+" failures="(\d+)" skipped="(\d+)" time="[\d.]+"/;

const results: FileResult[] = [];
for (const entry of readdirSync(dir)
  .filter((f) => f.endsWith(".xml"))
  .sort()) {
  const xml = readFileSync(join(dir, entry), "utf8");
  for (const line of xml.split("\n")) {
    const m = line.match(fileSuiteRe);
    if (!m) continue;
    results.push({
      name: m[1],
      tests: Number(m[2]),
      failures: Number(m[3]),
      skipped: Number(m[4]),
    });
  }
}
results.sort((a, b) => a.name.localeCompare(b.name));

const totals = results.reduce(
  (acc, r) => ({
    tests: acc.tests + r.tests,
    failures: acc.failures + r.failures,
    skipped: acc.skipped + r.skipped,
  }),
  { tests: 0, failures: 0, skipped: 0 },
);

const lines: string[] = ["## Testergebnisse", ""];
lines.push(
  totals.failures > 0
    ? `❌ **${totals.failures} von ${totals.tests} Tests fehlgeschlagen**`
    : `✅ **${totals.tests} Tests bestanden**${totals.skipped ? `, ${totals.skipped} übersprungen` : ""}`,
);
lines.push("", "<details><summary>Nach Testdatei</summary>", "");
lines.push("| Datei | Tests | Fehler | Übersprungen |", "|---|---|---|---|");
for (const r of results) {
  const icon = r.failures > 0 ? "❌" : r.skipped > 0 ? "⚠️" : "✅";
  lines.push(
    `| ${icon} \`${r.name}\` | ${r.tests} | ${r.failures} | ${r.skipped} |`,
  );
}
lines.push("", "</details>");

const output = `${lines.join("\n")}\n`;
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  appendFileSync(summaryPath, output);
} else {
  console.log(output);
}
