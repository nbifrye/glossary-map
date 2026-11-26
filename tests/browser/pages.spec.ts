import { expect, test } from "@playwright/test";

test("トップページから用語集のページを開ける", async ({ page }) => {
	await page.goto("./");
	await page
		.getByRole("link", {
			name: "NIST SP 800-63-4 デジタルアイデンティティガイドライン",
		})
		.click();
	await expect(page).toHaveURL(/\/sp800-63-4\/$/);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		"NIST SP 800-63-4 デジタルアイデンティティガイドライン",
	);
	await expect(page.locator("#criterion-emphasis")).toBeVisible();
});

test("用語集のページから用語のページを開ける", async ({ page }) => {
	await page.goto("./sp800-63-4/");
	await page.getByRole("link", { name: "hash function", exact: true }).click();
	await expect(page).toHaveURL(/\/sp800-63-4\/terms\/hash-function\/$/);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		"hash function",
	);
	await expect(page.getByText("ハッシュ関数", { exact: true })).toBeVisible();
});

test("原文中の参照箇所から参照先の用語に移動できる", async ({ page }) => {
	await page.goto("./sp800-63-4/terms/approved-cryptography/");
	await page.locator("a.reference", { hasText: "hash function" }).click();
	await expect(page).toHaveURL(/\/sp800-63-4\/terms\/hash-function\/$/);
});

test("参照先と参照元を、根拠とともに確認できる", async ({ page }) => {
	await page.goto("./sp800-63-4/terms/approved-cryptography/");
	await expect(
		page.getByRole("heading", { name: "参照先 (2 語)" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "参照元 (1 語)" }),
	).toBeVisible();
	await expect(
		page.getByText("「hash function」 (26 〜 38 文字目、基準: emphasis)"),
	).toBeVisible();
	await page
		.getByRole("link", { name: "authenticated protected channel" })
		.click();
	await expect(page).toHaveURL(
		/\/sp800-63-4\/terms\/authenticated-protected-channel\/$/,
	);
});
