// The shots of docs/guide/. `run` may click and type before the picture is
// taken and may return a clip rectangle ({x, y, width, height}) to crop to.
// `t(en, de)` picks the button label of the language being recorded.
// `themed: false` for pages that look the same in both themes (sign-in).

const W = "/nimbus";
const PROJECT = `${W}/project/web-app`;

/** The box of an element, grown by `pad`, kept inside the viewport. */
async function clipOf(page, locator, pad = 28) {
  const box = await locator.first().boundingBox();
  const vp = page.viewportSize();
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  return {
    x,
    y,
    width: Math.min(vp.width - x, box.width + 2 * pad),
    height: Math.min(vp.height - y, box.height + 2 * pad),
  };
}
const dialog = (page) => page.locator('[role="dialog"]').last();

/** Types into the focused element like a person would. */
const type = (page, text, delay = 35) => page.keyboard.type(text, { delay });

export const SHOTS = [
  // ── Getting started ──
  { name: "login", path: "/login", size: [1280, 800], signedIn: false, themed: false },
  {
    name: "create-workspace",
    path: "/create-workspace",
    size: [1100, 640],
    async run({ page }) {
      await page.getByRole("textbox").first().fill("Acme Inc.");
      return clipOf(page, dialog(page), 40).catch(() => undefined);
    },
  },
  {
    name: "project-create",
    path: `${W}/projects`,
    size: [1100, 760],
    async run({ page, t }) {
      await page.keyboard.press("n");
      await page.waitForTimeout(500);
      await page.getByRole("textbox").first().fill(t("Customer Portal", "Kundenportal"));
      await page.getByRole("textbox").nth(1).fill(t("Everything customers see and use.", "Alles, was Kunden sehen und nutzen."));
      return clipOf(page, dialog(page), 30);
    },
  },
  {
    name: "new-issue",
    path: PROJECT,
    size: [1200, 760],
    async run({ page, t }) {
      await page.keyboard.press("c");
      await page.waitForTimeout(500);
      await type(page, t("Checkout fails on Safari when the discount field is empty", "Checkout schlägt in Safari fehl, wenn das Rabattfeld leer ist"));
      return clipOf(page, dialog(page), 30);
    },
  },
  { name: "board", path: PROJECT, size: [1440, 860] },
  {
    name: "invite",
    path: `${W}/members`,
    size: [1100, 760],
    async run({ page, t }) {
      await page.getByRole("button", { name: t("Invite member", "Mitglied einladen") }).first().click();
      await page.waitForTimeout(500);
      await page.getByRole("textbox").first().fill("ada@nimbus.io, alex@nimbus.io");
      return clipOf(page, dialog(page), 30);
    },
  },

  // ── Using Barynt ──
  {
    name: "issue-detail",
    path: `${W}/issue/NIM-1`,
    size: [1440, 1000],
    wait: 1400,
  },
  {
    name: "relations",
    path: `${W}/issue/NIM-11`,
    size: [1440, 1000],
    wait: 1400,
  },
  {
    name: "editor",
    path: `${W}/issue/NIM-11`,
    size: [1200, 900],
    async run({ page }) {
      const box = page.locator("[data-comment-editor] .ProseMirror, .ProseMirror").last();
      await box.scrollIntoViewIfNeeded();
      await box.click();
      await type(page, "/");
      await page.waitForTimeout(700);
      const vp = page.viewportSize();
      return { x: 0, y: 0, width: vp.width, height: vp.height };
    },
  },
  {
    name: "filter",
    path: PROJECT,
    size: [1100, 640],
    async run({ page, t }) {
      await page.getByText(t("Filter", "Filter"), { exact: true }).first().click();
      await page.waitForTimeout(500);
      return { x: 230, y: 90, width: 420, height: 420 };
    },
  },
  {
    name: "display",
    path: PROJECT,
    size: [1440, 800],
    async run({ page, t }) {
      await page.getByText(t("Display", "Anzeige"), { exact: true }).first().click();
      await page.waitForTimeout(500);
      return { x: 1040, y: 60, width: 400, height: 420 };
    },
  },
  { name: "views-gallery", path: `${W}/views`, size: [1440, 800] },
  {
    name: "view-dialog",
    path: PROJECT,
    size: [1200, 800],
    async run({ page }) {
      await page.locator('button[aria-label*="iew"], button[title*="iew"]').filter({ hasText: /^$/ }).last().click().catch(() => {});
      await page.waitForTimeout(600);
      return clipOf(page, dialog(page), 30);
    },
  },
  { name: "dashboard", path: `${PROJECT}/overview`, size: [1440, 900], wait: 1500 },
  {
    name: "dashboard-edit",
    path: `${PROJECT}/overview`,
    size: [1440, 900],
    wait: 1500,
    async run({ page, t }) {
      await page.getByRole("button", { name: t("Edit", "Bearbeiten") }).first().click();
      await page.waitForTimeout(800);
    },
  },
  {
    name: "widget-gallery",
    path: `${PROJECT}/overview`,
    size: [1300, 800],
    wait: 1500,
    async run({ page, t }) {
      await page.getByRole("button", { name: t("Edit", "Bearbeiten") }).first().click();
      await page.getByRole("button", { name: t("Add widget", "Widget hinzufügen") }).first().click();
      await page.waitForTimeout(900);
      return clipOf(page, dialog(page), 24);
    },
  },
  { name: "inbox", path: `${W}/inbox`, size: [1280, 720] },
  {
    name: "palette",
    path: PROJECT,
    size: [1100, 640],
    async run({ page }) {
      await page.keyboard.press("Meta+k");
      await page.waitForTimeout(500);
      await type(page, "safari");
      await page.waitForTimeout(1500);
      return { x: 190, y: 40, width: 720, height: 480 };
    },
  },
  { name: "shortcuts-settings", path: `${W}/account/shortcuts`, size: [1280, 860] },
  {
    name: "share-modal",
    path: `${W}/issue/NIM-1`,
    size: [1200, 800],
    async run({ page, t }) {
      await page.getByRole("button", { name: t("More actions", "Weitere Aktionen") }).first().click();
      await page.getByRole("menuitem", { name: t("Share public link", "Öffentlichen Link teilen") }).click();
      await page.waitForTimeout(700);
      return clipOf(page, dialog(page), 30);
    },
  },
  { name: "projects-overview", path: `${W}/projects`, size: [1280, 560] },

  // ── Administration ──
  { name: "workspace-settings", path: `${W}/settings`, size: [1440, 1100] },
  { name: "members", path: `${W}/members`, size: [1280, 760] },
  { name: "invitations", path: `${W}/settings/invitations`, size: [1280, 640] },
  { name: "teams", path: `${W}/teams`, size: [1280, 520] },
  {
    name: "team-dialog",
    path: `${W}/teams`,
    size: [1100, 800],
    async run({ page, t }) {
      await page.getByRole("button", { name: t("New team", "Neues Team") }).first().click();
      await page.waitForTimeout(600);
      await page.getByRole("textbox").first().fill(t("Customer Success", "Kundenerfolg"));
      return clipOf(page, dialog(page), 30);
    },
  },
  { name: "roles", path: `${W}/roles`, size: [1440, 900] },
  {
    name: "role-editor",
    path: `${W}/roles`,
    size: [1440, 900],
    async run({ page }) {
      await page.getByRole("tab", { name: /Project roles|Projektrollen/ }).click().catch(() => {});
      await page.waitForTimeout(500);
      await page.getByText("Team member").first().click();
      await page.waitForTimeout(800);
    },
  },
  { name: "project-settings", path: `${PROJECT}/settings`, size: [1440, 1000] },
  { name: "project-members", path: `${PROJECT}/settings/members`, size: [1280, 800] },
  { name: "audit", path: `${W}/settings/activity`, size: [1280, 760] },
  { name: "admin-overview", path: "/admin", size: [1440, 1000], wait: 1500 },

  // ── Integrations and settings ──
  { name: "webhooks", path: `${W}/settings/webhooks`, size: [1280, 560] },
  {
    name: "webhook-dialog",
    path: `${W}/settings/webhooks`,
    size: [1100, 800],
    async run({ page, t }) {
      await page.getByRole("button", { name: t("New webhook", "Neuer Webhook") }).first().click();
      await page.waitForTimeout(600);
      await page.getByRole("textbox").first().fill("https://hooks.nimbus.io/barynt/chat");
      return clipOf(page, dialog(page), 30);
    },
  },
  { name: "api-keys", path: `${W}/account/api-keys`, size: [1280, 780] },
  {
    name: "api-key-created",
    path: `${W}/account/api-keys`,
    size: [1100, 800],
    async run({ page, t }) {
      await page.getByRole("button", { name: t("New key", "Neuer Schlüssel") }).first().click();
      await page.waitForTimeout(600);
      await page.getByRole("textbox").first().fill(t("Deploy bot", "Deploy-Bot"));
      await page.getByRole("button", { name: t("Create key", "Schlüssel erstellen") }).last().click();
      await page.waitForTimeout(1200);
      return clipOf(page, dialog(page), 30);
    },
  },
  { name: "mcp-settings", path: `${W}/account/mcp`, size: [1280, 900] },
  { name: "account-general", path: `${W}/account`, size: [1280, 860] },
  { name: "account-appearance", path: `${W}/account/appearance`, size: [1280, 600] },
  { name: "account-navigation", path: `${W}/account/navigation`, size: [1280, 900] },
  { name: "account-notifications", path: `${W}/account/notifications`, size: [1280, 640] },
  { name: "account-security", path: `${W}/account/security`, size: [1280, 420] },
];
