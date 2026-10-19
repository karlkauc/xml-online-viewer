import { expect, test } from "@playwright/test";

const XSD = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="Order"><xs:complexType><xs:sequence>
    <xs:element name="Currency"><xs:simpleType><xs:restriction base="xs:string"><xs:pattern value="[A-Z]{3}"/></xs:restriction></xs:simpleType></xs:element>
  </xs:sequence></xs:complexType></xs:element>
</xs:schema>`;
const XML = `<Order><Currency>eur</Currency></Order>`;

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("error pages explain a validation error and link back to the validator", async ({ page }) => {
    await page.goto("/errors");
    await page.getByRole("link", { name: "The value is not accepted by the pattern" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("cvc-pattern-valid");
    await expect(page.getByText("[facet 'pattern']").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Validate your XML file" })).toHaveAttribute("href", "/");
  });

  test("the home shell has real text and the FAQ", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Validate XML against XSD online" })).toBeVisible();
    await expect(page.getByText("Does it check Schematron or business rules?")).toBeVisible();
  });
});

test("a ?url=&xsd= link loads, validates, explains the error and shares the report", async ({ page, request, context }) => {
  // Parse through the real backend, then answer the URL loads with those results (offline).
  const xml = await (await request.post("/api/xml/text", { data: { content: XML, filename: "order.xml" } })).json();
  const xsd = await (await request.post("/api/xsd/text", { data: { content: XSD, filename: "order.xsd" } })).json();
  await page.route("**/api/xml/url", (route) => route.fulfill({ json: xml }));
  await page.route("**/api/xsd/url", (route) => route.fulfill({ json: xsd }));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto("/?url=https://example.com/order.xml&xsd=https://example.com/order.xsd");
  const help = page.getByRole("link", { name: "What does this mean?" }).first();
  await expect(help).toHaveAttribute("href", "/errors/pattern-mismatch");
  await expect(page.getByRole("link", { name: /View this schema as a diagram/ })).toHaveAttribute("href", /xsd-viewer\.online\/url\?src=https%3A%2F%2Fexample\.com%2Forder\.xsd/);

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: /Share report/ }).click();
  await expect(page.getByRole("button", { name: /Link copied/ })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/report#z\./);
  expect(link).not.toContain("eur</Currency>");

  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Shared validation report" })).toBeVisible();
  await expect(page.getByText("order.xml")).toBeVisible();
  await expect(page.getByText(/not accepted by the pattern/)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Excel report/ }).click();
  expect((await download).suggestedFilename()).toBe("validation_report_shared.xlsx");
});

test("the landing page links to the guides and error explanations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "XML validation errors explained" })).toHaveAttribute("href", "/errors");
  await page.getByRole("link", { name: "All guides and resources →" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Guides and resources" })).toBeVisible();
  await expect(page.getByRole("link", { name: /XML validation errors explained/ })).toBeVisible();
});
