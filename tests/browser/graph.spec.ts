import { expect, type Page, test } from "@playwright/test";

/**
 * グラフの表示を確かめる。WebGL 2 を使えない環境 (GPU のない環境のブラウザーなど) では、
 * 表示できなかったことを利用者に示していることを確かめて false を返す
 */
async function expectGraph(page: Page, status: RegExp): Promise<boolean> {
	const graph = page.locator("[data-graph]");
	const message = page.locator("[data-graph-status]");
	await expect(graph).toHaveAttribute("data-graph-state", /ready|error/);
	const webgl2 = await page.evaluate(
		() => document.createElement("canvas").getContext("webgl2") !== null,
	);
	if (!webgl2) {
		await expect(graph).toHaveAttribute("data-graph-state", "error");
		await expect(message).toHaveText(/^グラフを表示できませんでした: /);
		return false;
	}
	// 失敗した場合は、画面に表示した理由をテストの結果に示す
	expect(
		await graph.getAttribute("data-graph-state"),
		(await message.textContent()) ?? "",
	).toBe("ready");
	await expect(graph.locator("canvas").first()).toBeVisible();
	await expect(message).toHaveText(status);
	return true;
}

test("用語集のページに全体グラフを表示できる", async ({ page }) => {
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") {
			errors.push(message.text());
		}
	});
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto("./sp800-63-4/");
	if (await expectGraph(page, /189 語の用語と 444 本の線を表示しています。/)) {
		expect(errors).toEqual([]);
	}
});

test("狭い画面では、用語集のページに全体グラフを表示しない", async ({
	page,
}) => {
	await page.setViewportSize({ width: 375, height: 800 });
	await page.goto("./sp800-63-4/");
	await expect(page.locator("[data-graph]")).toBeHidden();
	await expect(page.locator("[data-graph]")).not.toHaveAttribute(
		"data-graph-state",
	);
});

test("用語のページでは、既定で周辺グラフを表示し、全体グラフに切り替えられる", async ({
	page,
}) => {
	await page.goto("./sp800-63-4/terms/approved-cryptography/");
	await expectGraph(page, /4 語の用語と 3 本の線を表示しています。/);
	await page.getByLabel("表示").selectOption("full");
	await expect(page).toHaveURL(/\?view=full$/);
	await expectGraph(page, /189 語の用語と 444 本の線を表示しています。/);
	await page.goBack();
	await expect(page.getByLabel("表示")).toHaveValue("neighborhood");
	await expectGraph(page, /4 語の用語と 3 本の線を表示しています。/);
});

test("狭い画面では、用語のページに周辺グラフだけを表示する", async ({
	page,
}) => {
	await page.setViewportSize({ width: 375, height: 800 });
	await page.goto("./sp800-63-4/terms/approved-cryptography/?view=full");
	await expect(page.getByLabel("表示")).toBeHidden();
	await expectGraph(page, /4 語の用語と 3 本の線を表示しています。/);
});

test("用語群と配置のアルゴリズムを URL で共有し、戻ると元に戻る", async ({
	page,
}) => {
	await page.goto("./sp800-63-4/");
	const cluster = page.getByLabel("用語群");
	const layout = page.getByLabel("配置");
	await expect(page.locator('[data-clustering="louvain"]')).toBeVisible();
	await expect(page.locator('[data-clustering="leiden"]')).toBeHidden();

	await cluster.selectOption("leiden");
	await expect(page).toHaveURL(/\?cluster=leiden$/);
	await expect(page.locator('[data-clustering="leiden"]')).toBeVisible();
	await expect(page.locator('[data-clustering="louvain"]')).toBeHidden();

	await layout.selectOption("hierarchy");
	await expect(page).toHaveURL(/\?cluster=leiden&layout=hierarchy$/);

	await page.goBack();
	await expect(layout).toHaveValue("forceatlas2");
	await expect(cluster).toHaveValue("leiden");
	await page.goBack();
	await expect(cluster).toHaveValue("louvain");
	await expect(page.locator('[data-clustering="louvain"]')).toBeVisible();

	// URL に直接アクセスしても、同じ表示になる
	await page.goto("./sp800-63-4/?cluster=leiden&layout=clusters");
	await expect(cluster).toHaveValue("leiden");
	await expect(layout).toHaveValue("clusters");
	await expect(page.locator('[data-clustering="leiden"]')).toBeVisible();
});

test("用語のページから、所属する用語群の一覧を開ける", async ({ page }) => {
	await page.goto("./sp800-63-4/terms/hash-function/");
	const link = page
		.getByRole("definition")
		.filter({ hasText: "用語群" })
		.getByRole("link")
		.first();
	const name = (await link.textContent()) ?? "";
	await link.click();
	await expect(page).toHaveURL(
		/\/sp800-63-4\/\?cluster=louvain#cluster-louvain-\d+$/,
	);
	const number = name.match(/用語群 (\d+)/)?.[1];
	await expect(
		page
			.locator(`#cluster-louvain-${number}`)
			.getByRole("link", { name: "hash function" })
			.first(),
	).toBeVisible();
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
