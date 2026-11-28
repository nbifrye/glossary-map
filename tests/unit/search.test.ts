import { expect, test } from "vitest";
import { keywords, normalize } from "../../src/site/search.ts";

test("NFKC で正規化して小文字にする", () => {
	expect(normalize("ＨＡＳＨ Function")).toBe("hash function");
	expect(normalize("ﾊｯｼｭ")).toBe("ハッシュ");
});

test("見出しと訳文をつなげてキーワードにする", () => {
	expect(keywords("Hash Function", "ハッシュ関数")).toBe(
		"hash function\nハッシュ関数",
	);
});
