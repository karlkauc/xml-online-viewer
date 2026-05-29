// One-off Playwright script that records a walkthrough of the SPA against the
// local sandbox (http://127.0.0.1:8092) and writes a WebM video to
// docs/media/_raw/. ffmpeg then converts that to the GIF used in the README —
// see docs/TECHNICAL.md ("Recording the README demo GIF").
//
// Run from the repo root, with the container up (docker compose up -d --build):
//   node scripts/record_demo.mjs
//
// Requires Playwright, installed under e2e/ (cd e2e && npm install).

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Reuse the Playwright install under e2e/ — keeps the repo root dependency-free.
const { chromium } = require("../e2e/node_modules/playwright");
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "docs/media/_raw");
mkdirSync(OUT_DIR, { recursive: true });

const BASE = process.env.VIEWER_URL ?? "http://127.0.0.1:8092";
const VIEWPORT = { width: 1280, height: 720 };

async function pause(page, ms) {
  await page.waitForTimeout(ms);
}

async function moveTo(page, locator, opts = {}) {
  // Slow, visible mouse motion so the recorded GIF reads as a walkthrough.
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: opts.steps ?? 18,
  });
  await pause(page, opts.hold ?? 250);
}

async function recordOverview(page) {
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  await pause(page, 800);

  const fileInputs = page.locator('input[type="file"]');

  // 1. Load XML data — the diagram view is the default.
  await fileInputs.nth(0).setInputFiles(resolve(ROOT, "samples/library.xml"));
  await page.waitForSelector(".react-flow__node-xmlElement", { timeout: 15_000 });
  await pause(page, 1400);

  // Click the root element to expand a level so the structure reads clearly.
  const rootNode = page.locator(".react-flow__node-xmlElement").first();
  await moveTo(page, rootNode);
  await rootNode.click();
  await pause(page, 1400);

  // 2. Switch to the Tree view and expand everything.
  const treeTab = page.getByRole("tab", { name: "Tree", exact: true });
  await moveTo(page, treeTab);
  await treeTab.click();
  await pause(page, 700);
  const expandAll = page.getByRole("button", { name: "Expand all" });
  await moveTo(page, expandAll);
  await expandAll.click();
  await pause(page, 1000);

  // Search the tree — full-text across tags, attributes and values.
  const search = page.getByPlaceholder("Search tag, attribute or value…");
  await moveTo(page, search);
  await search.type("author", { delay: 95 });
  await pause(page, 1400);
  await search.fill("");
  await pause(page, 700);

  // 3. Load an XSD schema — validation runs automatically once both are present.
  await fileInputs.nth(1).setInputFiles(resolve(ROOT, "samples/library.xsd"));
  // Wait for the error list to appear (the sample XML is invalid by design).
  const firstError = page.locator("li", { hasText: /Line/ }).first();
  await firstError.waitFor({ timeout: 15_000 });
  await pause(page, 1600);

  // 4. Click an error — the offending node is revealed, centred and highlighted.
  await moveTo(page, firstError);
  await firstError.click();
  await pause(page, 1800);

  // 5. Linger on the "Excel report" download as the closing beat.
  const excel = page.getByRole("link", { name: /Excel report/ });
  await moveTo(page, excel, { hold: 700 });
  await pause(page, 1500);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: OUT_DIR, size: VIEWPORT },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

try {
  await recordOverview(page);
} finally {
  await page.close();
  await context.close();
  await browser.close();
}

console.log("done: overview");
