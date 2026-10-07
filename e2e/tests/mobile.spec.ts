import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIBRARY_XML = resolve(__dirname, "../../samples/library.xml");
const LIBRARY_XSD = resolve(__dirname, "../../samples/library.xsd");
// library.xml omits the <price> element the schema requires, once per book.
const EXPECTED_ERRORS = "3 errors";

async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "page must not scroll horizontally").toBeLessThanOrEqual(clientWidth);
}

/** Load the sample document; the diagram is the default view on every tier. */
async function loadXml(page: Page) {
  await page.goto("/");
  await page.locator('input[type="file"]').first().setInputFiles(LIBRARY_XML);
  await expect(page.locator(".react-flow")).toBeVisible();
}

/** Load the schema through the second (XSD) loader. Phones auto-collapse the
 *  Files section after the XML load, so expand it first there. */
async function loadXsd(page: Page) {
  const files = page.getByRole("button", { name: /Files/ });
  if ((await files.getAttribute("aria-expanded")) === "false") await files.click();
  await page.locator('input[type="file"]').nth(1).setInputFiles(LIBRARY_XSD);
}

test.describe("phone", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "phone project only");
  });

  test("landing page fits the viewport and folds secondary header actions into a menu", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "XML Online Viewer" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("button", { name: "More actions" })).toBeVisible();
    await expect(page.getByRole("button", { name: "About this app" })).toBeHidden();
    await page.getByRole("button", { name: "More actions" }).click();
    await expect(page.getByRole("menuitem", { name: "About this app" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: "About this app" })).toBeHidden();
  });

  test("bottom nav walks diagram → tree → validation and an error jumps back to the view", async ({ page }) => {
    await loadXml(page);
    await expectNoHorizontalOverflow(page);

    // Files collapsed itself to make room for the document.
    await expect(page.getByRole("button", { name: /Files/ })).toHaveAttribute("aria-expanded", "false");

    const nav = page.getByRole("navigation", { name: "Panes" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("button", { name: "Diagram" })).toHaveAttribute("aria-pressed", "true");

    // Compact toolbar keeps export behind a menu.
    await expect(page.getByRole("button", { name: "Export SVG" })).toBeHidden();
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Export SVG" })).toBeVisible();
    await page.keyboard.press("Escape");

    // Tree pane: tapping a row selects it but stays on the tree.
    await nav.getByRole("button", { name: "Tree" }).click();
    await expect(page.locator(".react-flow")).toBeHidden();
    const section = page.getByRole("treeitem").filter({ hasText: "section" }).first();
    await expect(section).toBeVisible();
    await section.click();
    await expect(section).toHaveAttribute("aria-selected", "true");
    await expect(nav.getByRole("button", { name: "Tree" })).toHaveAttribute("aria-pressed", "true");
    await expectNoHorizontalOverflow(page);

    // Validation pane, then load the schema and pick an error.
    await nav.getByRole("button", { name: "Validation" }).click();
    await expect(page.getByText("Load XML data and an XSD schema to validate.")).toBeVisible();
    await loadXsd(page);
    // The schema load collapsed Files again so the result has the screen.
    await expect(page.getByRole("button", { name: /Files/ })).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText(EXPECTED_ERRORS)).toBeVisible();
    await page.getByRole("listitem").filter({ hasText: "Missing child element" }).first().click();

    // Back on the tree with the erroneous <book> selected.
    await expect(nav.getByRole("button", { name: "Tree" })).toHaveAttribute("aria-pressed", "true");
    const selected = page.getByRole("treeitem").filter({ hasText: "book" }).and(page.locator('[aria-selected="true"]'));
    await expect(selected.first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("header search switches to the tree and focuses the search box", async ({ page }) => {
    await loadXml(page);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.locator(".react-flow")).toBeHidden();
    await expect(page.getByPlaceholder(/^Search tag/)).toBeFocused();
  });
});

test.describe("tablet", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "tablet", "tablet project only");
  });

  test("shows the tab strip with validation in a drawer", async ({ page }) => {
    await loadXml(page);
    await expectNoHorizontalOverflow(page);

    await expect(page.getByRole("navigation", { name: "Panes" })).toBeHidden();
    await expect(page.getByRole("tab", { name: "Tree" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Diagram" })).toBeVisible();

    const drawer = page.getByRole("complementary", { name: "Validation" });
    await expect(drawer).toBeHidden();
    await page.getByRole("button", { name: "Show validation" }).click();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Validate" })).toBeVisible();

    await loadXsd(page);
    await expect(drawer.getByText(EXPECTED_ERRORS)).toBeVisible();
    // Picking an error keeps the drawer open on tablets.
    await drawer.getByRole("listitem").filter({ hasText: "Missing child element" }).first().click();
    await expect(drawer).toBeVisible();

    await page.getByRole("button", { name: "Close validation" }).click();
    await expect(drawer).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("notes about the loaded document", () => {
  const file = (name: string, content: string) => ({ name, mimeType: "application/xml", buffer: Buffer.from(content) });

  test("a repaired input and an unloadable schema are reported even with Files collapsed", async ({ page }, testInfo) => {
    await page.goto("/");
    // Whitespace before the declaration is repaired; the schema location is
    // relative, so there is nothing to download for an uploaded file.
    const xml = '\n<?xml version="1.0"?>\n<a xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="a.xsd"/>';
    await page.locator('input[type="file"]').first().setInputFiles(file("a.xml", xml));
    await expect(page.locator(".react-flow")).toBeVisible();
    if (testInfo.project.name === "phone") {
      await expect(page.getByRole("button", { name: /Files/ })).toHaveAttribute("aria-expanded", "false");
    }
    await expect(page.getByText("Leading whitespace before the XML declaration was removed.", { exact: false })).toBeVisible();
    await expect(page.getByText("This document references a.xsd.", { exact: false })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("input that is not XML is named instead of quoting the parser", async ({ page }) => {
    await page.goto("/");
    await page.locator('input[type="file"]').first().setInputFiles(file("data.xml", '{"a": 1}'));
    await expect(page.getByRole("alert").filter({ hasText: "not an XML file — it looks like JSON" })).toBeVisible();
  });
});

test.describe("expired documents", () => {
  test("validation reloads a document the server no longer has", async ({ page }, testInfo) => {
    // Answer the first validate call the way an instance that never saw the
    // upload would; the client must re-send the file and try again.
    let expired = false;
    await page.route("**/api/validate", async (route) => {
      if (expired) return route.continue();
      expired = true;
      await route.fulfill({ status: 404, contentType: "application/json", body: '{"detail":"XML not found or expired"}' });
    });
    await loadXml(page);
    const reupload = page.waitForRequest((r) => r.url().endsWith("/api/xml/upload"));
    if (testInfo.project.name === "phone") {
      await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: "Validation" }).click();
    } else {
      await page.getByRole("button", { name: "Show validation" }).click();
    }
    await loadXsd(page);
    await reupload;
    await expect(page.getByText(EXPECTED_ERRORS)).toBeVisible();
    await expect(page.getByText("not found or expired")).toBeHidden();
  });
});

test.describe("schema split over several files", () => {
  const XS = 'xmlns:xs="http://www.w3.org/2001/XMLSchema"';
  const xsd = (name: string, content: string) => ({ name, mimeType: "application/xml", buffer: Buffer.from(content) });
  const DEP = xsd("dep.xsd", `<xs:schema ${XS} targetNamespace="urn:d"><xs:simpleType name="T"><xs:restriction base="xs:integer"/></xs:simpleType></xs:schema>`);
  const MAIN = xsd(
    "main.xsd",
    `<xs:schema ${XS} xmlns:d="urn:d"><xs:import namespace="urn:d" schemaLocation="dep.xsd"/><xs:element name="a" type="d:T"/></xs:schema>`,
  );

  async function loadDocument(page: Page) {
    await page.goto("/");
    await page.locator('input[type="file"]').first().setInputFiles(xsd("a.xml", "<a>12</a>"));
    await expect(page.locator(".react-flow")).toBeVisible();
    const files = page.getByRole("button", { name: /Files/ });
    if ((await files.getAttribute("aria-expanded")) === "false") await files.click();
  }

  /** Phones collapse Files once the schema loaded; its summary row names it. */
  async function expectSchemaLoaded(page: Page, name: string) {
    await expect(page.getByText(new RegExp(`(✓ |XSD: )${name.replace(".", "\\.")}`)).first()).toBeVisible();
  }

  test("the main file alone names what is missing; with its import it loads", async ({ page }) => {
    await loadDocument(page);
    const input = page.locator('input[type="file"]').nth(1);
    await input.setInputFiles(MAIN);
    await expect(page.getByRole("alert").filter({ hasText: "1 imported or included file is missing (dep.xsd)" })).toBeVisible();
    await input.setInputFiles([DEP, MAIN]);
    await expectSchemaLoaded(page, "main.xsd");
  });

  test("an ambiguous set asks which schema is the main one", async ({ page }) => {
    await loadDocument(page);
    const other = xsd("other.xsd", `<xs:schema ${XS}><xs:element name="a" type="xs:integer"/></xs:schema>`);
    await page.locator('input[type="file"]').nth(1).setInputFiles([DEP, MAIN, other]);
    const select = page.getByLabel("Which one is the main schema?");
    await expect(select).toBeVisible();
    await expect(select.locator("option")).toHaveText(["dep.xsd", "main.xsd", "other.xsd"]);
    await expectNoHorizontalOverflow(page);
    await select.selectOption("other.xsd");
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await expectSchemaLoaded(page, "other.xsd");
  });
});
