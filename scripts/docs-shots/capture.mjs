// Records the screenshots of docs/guide/ from a running Barynt with the demo
// data (workspace "Nimbus", see demo.sql). One image per shot, language and
// theme, written as WebP next to the pages:
//
//   en/name.webp        English, dark      de/name.webp        German, dark
//   en/name.light.webp  English, light     de/name.light.webp  German, light
//
//   node scripts/docs-shots/capture.mjs                  # everything
//   node scripts/docs-shots/capture.mjs board inbox      # only these shots
//   LANGS=en THEMES=dark node scripts/docs-shots/capture.mjs
//
// Needs: a running app (BASE_URL, default http://localhost:3000), Postgres
// reachable with `psql`/`pg_restore`, Playwright (`npm i -g playwright`) and
// the repository's own `sharp`. See README.md here.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";
import pg from "pg";
import sharp from "sharp";
import { SHOTS } from "./shots.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
try {
  process.loadEnvFile(join(ROOT, ".env"));
} catch {
  /* env may come from the shell */
}

const BASE = process.env.BASE_URL || "http://localhost:3000";
const VERSION = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
).version;
const OUT = join(ROOT, "docs/guide/assets");
const SNAPSHOT = process.env.SNAPSHOT || ""; // pg_dump -Fc -a of the demo data
const PG = [
  "-h",
  process.env.PGHOST || "localhost",
  "-U",
  process.env.PGUSER || "postgres",
  "-d",
  process.env.PGDATABASE || "IssueTracker",
];
const OWNER = "owner@nimbus.io";
const LANGS = (process.env.LANGS || "en,de").split(",");
const THEMES = (process.env.THEMES || "dark,light").split(",");
const only = process.argv.slice(2);

const sql = (query) =>
  execFileSync("psql", [...PG, "-At", "-c", query], {
    encoding: "utf8",
  }).trim();

/** Back to the snapshot: empty every table, load the demo data again. */
function resetDb() {
  if (!SNAPSHOT) return;
  const tables = sql(
    `select string_agg(format('%I', tablename), ', ') from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`,
  );
  sql(`TRUNCATE ${tables} CASCADE`);
  try {
    execFileSync(
      "pg_restore",
      [...PG, "--data-only", "--disable-triggers", SNAPSHOT],
      { stdio: "ignore" },
    );
  } catch {
    /* warnings only */
  }
}

function setTheme(theme) {
  sql(
    `insert into "UserPreferences" ("userId", theme) select id, '${theme}' from "User" where email = '${OWNER}' on conflict ("userId") do update set theme = '${theme}'`,
  );
}

async function sessionToken() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(
    `select id, "firstName", "lastName", color from "User" where email = $1`,
    [OWNER],
  );
  await client.end();
  const u = rows[0];
  const token = {
    sub: u.id,
    id: u.id,
    email: OWNER,
    name: `${u.firstName} ${u.lastName}`,
    firstName: u.firstName,
    lastName: u.lastName,
    color: u.color,
  };
  return {
    value: await encode({
      secret: process.env.AUTH_SECRET,
      salt: "authjs.session-token",
      token,
      maxAge: 60 * 60,
    }),
    userId: u.id,
  };
}

const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function newContext(
  browser,
  { lang, theme, size, session, signedIn = true },
) {
  const ctx = await browser.newContext({
    viewport: { width: size[0], height: size[1] },
    colorScheme: theme,
    locale: lang === "de" ? "de-DE" : "en-US",
    userAgent: MAC, // so the shortcuts read ⌘, not Strg
    deviceScaleFactor: 1,
  });
  if (signedIn) {
    const host = new URL(BASE).hostname;
    await ctx.addCookies([
      {
        name: "authjs.session-token",
        value: session.value,
        domain: host,
        path: "/",
      },
      {
        name: "barynt_seen_release",
        value: process.env.SEEN_VERSION || VERSION,
        domain: host,
        path: "/",
      }, // no release-notes window
    ]);
    await ctx.addInitScript((uid) => {
      try {
        localStorage.setItem(`barynt:passkeyNudgeDismissed:${uid}`, "1");
      } catch {}
      try {
        Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
      } catch {}
    }, session.userId);
  }
  return ctx;
}

async function write(png, name, lang, theme, themed) {
  const dir = join(OUT, lang === "de" ? "de" : "en");
  mkdirSync(dir, { recursive: true });
  const file = join(
    dir,
    `${name}${theme === "light" && themed ? ".light" : ""}.webp`,
  );
  await sharp(png).webp({ quality: 80, effort: 5 }).toFile(file);
  return file;
}

mkdirSync(OUT, { recursive: true });
const shots = SHOTS.filter((s) => !only.length || only.includes(s.name));
const session = await sessionToken();
const browser = await chromium.launch();
let failed = 0;

for (const theme of THEMES) {
  for (const lang of LANGS) {
    setTheme(theme);
    for (const shot of shots) {
      if (theme === "light" && shot.themed === false) continue; // the same in both
      resetDb();
      setTheme(theme);
      const ctx = await newContext(browser, {
        lang,
        theme,
        size: shot.size || [1440, 900],
        session,
        signedIn: shot.signedIn !== false,
      });
      const page = await ctx.newPage();
      const L = lang === "de" ? "de" : "en";
      const url = (path) => `${BASE}/${L}${path}`;
      try {
        await page.goto(url(shot.path), {
          waitUntil: "networkidle",
          timeout: 40000,
        });
        await page.waitForTimeout(shot.wait ?? 900);
        const env = {
          page,
          ctx,
          lang: L,
          t: (en, de) => (L === "de" ? de : en),
          url,
          BASE,
          browser,
          newContext,
          session,
          theme,
        };
        const clip = shot.run ? await shot.run(env) : undefined;
        await page.waitForTimeout(400);
        const png = await page.screenshot(clip ? { clip } : {});
        const file = await write(
          png,
          shot.name,
          lang,
          theme,
          shot.themed !== false,
        );
        console.log(
          "ok  ",
          shot.name,
          lang,
          theme,
          file.replace(`${ROOT}/`, ""),
        );
      } catch (error) {
        failed++;
        console.log(
          "FAIL",
          shot.name,
          lang,
          theme,
          String(error.message).split("\n")[0],
        );
        try {
          await page.screenshot({
            path: `/tmp/docs-shot-fail-${shot.name}-${lang}-${theme}.png`,
          });
        } catch {}
      }
      await ctx.close();
    }
  }
}
await browser.close();
resetDb();
setTheme("dark");
console.log(failed ? `${failed} shot(s) failed` : "done");
process.exit(failed ? 1 : 0);
