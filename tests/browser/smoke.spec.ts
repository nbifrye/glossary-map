import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("トップページを表示できる", async ({ page }) => {
	await page.goto("./");
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		"Glossary Map",
	);
});

const pages = [
	{ name: "トップページ", path: "./" },
	{ name: "用語集のページ", path: "./sp800-63-4/" },
	{ name: "用語のページ", path: "./sp800-63-4/terms/hash-function/" },
];

for (const { name, path } of pages) {
	test(`${name}に Content Security Policy が設定されている`, async ({
		page,
	}) => {
		await page.goto(path);
		const content = await page
			.locator('meta[http-equiv="content-security-policy"]')
			.getAttribute("content");
		const directives = new Map(
			(content ?? "")
				.split(";")
				.filter((directive) => directive.trim())
				.map((directive): [string, string[]] => {
					const [name = "", ...sources] = directive.trim().split(/\s+/);
					return [name, sources];
				}),
		);
		expect(directives.get("default-src")).toEqual(["'self'"]);
		expect(directives.get("object-src")).toEqual(["'none'"]);
		expect(directives.get("base-uri")).toEqual(["'self'"]);
		expect(directives.get("form-action")).toEqual(["'self'"]);
		// script-src と style-src では、自サイトとハッシュで指定したインラインのものだけを許可する
		for (const name of ["script-src", "style-src"]) {
			const sources = directives.get(name);
			expect(sources).toContain("'self'");
			for (const source of sources ?? []) {
				expect(source).toMatch(/^'(self|sha(256|384|512)-[A-Za-z0-9+/=]+)'$/);
			}
		}
	});

	test(`${name}にアクセシビリティの違反がない`, async ({ page }) => {
		await page.goto(path);
		const results = await new AxeBuilder({ page })
			.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
			.analyze();
		expect(results.violations).toEqual([]);
	});
}
