import { describe, expect, test } from "vitest";
import {
	codePointLength,
	linkHrefs,
	plainText,
	sliceCodePoints,
} from "../../src/data/text.ts";
import type { Block } from "../../src/data/types.ts";

const blocks: Block[] = [
	{
		type: "paragraph",
		children: [
			{ type: "text", value: "A " },
			{
				type: "link",
				href: "#subscriber",
				children: [
					{
						type: "emphasis",
						children: [{ type: "text", value: "subscriber" }],
					},
				],
			},
			{ type: "text", value: "." },
		],
	},
	{
		type: "list",
		ordered: false,
		items: [
			[{ type: "paragraph", children: [{ type: "text", value: "one" }] }],
			[{ type: "paragraph", children: [{ type: "text", value: "two" }] }],
		],
	},
];

describe("plainText", () => {
	test("文字列を文書の順にそのまま連結する", () => {
		expect(plainText(blocks)).toBe("A subscriber.onetwo");
	});
});

describe("コードポイント単位の操作", () => {
	test("サロゲートペアを 1 文字として数える", () => {
		expect(codePointLength("a😀b")).toBe(3);
		expect(sliceCodePoints("a😀b", 1, 3)).toBe("😀b");
	});
});

describe("linkHrefs", () => {
	test("入れ子になったリンクも含めてすべての URL を返す", () => {
		expect(linkHrefs(blocks)).toEqual(["#subscriber"]);
	});
});
