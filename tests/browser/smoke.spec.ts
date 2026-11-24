import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("トップページを表示できる", async ({ page }) => {
	await page.goto("./");
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		"Glossary Map",
	);
});

test("トップページに Content Security Policy が設定されている", async ({
	page,
}) => {
	await page.goto("./");
	const csp = page.locator('meta[http-equiv="content-security-policy"]');
	await expect(csp).toHaveAttribute("content", /default-src 'self'/);
});

test("トップページにアクセシビリティの違反がない", async ({ page }) => {
	await page.goto("./");
	const results = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
		.analyze();
	expect(results.violations).toEqual([]);
});
