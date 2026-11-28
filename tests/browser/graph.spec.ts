import { expect, test } from "@playwright/test";

test("用語集のページに全体グラフを表示できる", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") {
			errors.push(message.text());
		}
	});
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("./sp800-63-4/");
	const graph = page.locator("[data-graph]");
	const status = page.locator("[data-graph-status]");
	await expect(graph).toHaveAttribute("data-graph-state", /ready|error/);
	const webgl2 = await page.evaluate(
		() => document.createElement("canvas").getContext("webgl2") !== null,
	);
	if (!webgl2) {
		// GPU のない環境のブラウザーなど、WebGL 2 を使えない場合は、表示できなかったことを利用者に示す
		await expect(graph).toHaveAttribute("data-graph-state", "error");
		await expect(status).toHaveText(/^グラフを表示できませんでした: /);
		return;
	}
	// 失敗した場合は、画面に表示した理由をテストの結果に示す
	expect(
		await graph.getAttribute("data-graph-state"),
		(await status.textContent()) ?? "",
	).toBe("ready");
	await expect(graph.locator("canvas").first()).toBeVisible();
	await expect(status).toHaveText(
		/189 語の用語と 444 本の線を表示しています。/,
	);
	expect(errors).toEqual([]);
});

test("狭い画面では全体グラフを表示しない", async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 800 });
	await page.goto("./sp800-63-4/");
	await expect(page.locator("[data-graph]")).toBeHidden();
	await expect(page.locator("[data-graph]")).not.toHaveAttribute(
		"data-graph-state",
	);
});

test("見出しと訳文で用語を検索できる", async ({ page }) => {
	await page.goto("./sp800-63-4/");
	const search = page.getByRole("searchbox", { name: "見出しと訳文で検索" });
	const list = page.locator("#terms");
	await search.fill("ハッシュ");
	await expect(list.locator("li:visible")).toHaveCount(1);
	await expect(list.getByRole("link", { name: "hash function" })).toBeVisible();
	await expect(page.locator("[data-search-status]")).toHaveText(
		"1 語の用語が見つかりました。",
	);
	// 全角の英字も、NFKC で正規化して検索する
	await search.fill("ＨＡＳＨ");
	await expect(list.getByRole("link", { name: "hash function" })).toBeVisible();
	await search.fill("");
	await expect(list.locator("li:visible")).toHaveCount(189);
});
