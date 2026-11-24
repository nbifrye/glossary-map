import { describe, expect, test } from "vitest";
import {
	codePointLength,
	linkHrefs,
	plainText,
	sliceCodePoints,
	textLayout,
} from "../../src/data/text.ts";
import type { Block } from "../../src/data/types.ts";

const blocks: Block[] = [
	{
		type: "paragraph",
		children: [
			{ type: "text", value: "A " },
			{
				type: "link",
				href: "https://example.com/#subscriber",
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
			[
				{
					type: "paragraph",
					children: [
						{
							type: "emphasis",
							children: [
								{
									type: "link",
									href: "https://example.com/#two",
									children: [{ type: "text", value: "two" }],
								},
							],
						},
					],
				},
			],
		],
	},
];

describe("plainText", () => {
	test("文字列を文書の順にそのまま連結する", () => {
		expect(plainText(blocks)).toBe("A subscriber.onetwo");
	});
});

describe("textLayout", () => {
	test("段落とリンクの範囲をコードポイント単位で求める", () => {
		expect(textLayout(blocks)).toEqual({
			text: "A subscriber.onetwo",
			paragraphs: [
				{ start: 0, end: 13 },
				{ start: 13, end: 16 },
				{ start: 16, end: 19 },
			],
			links: [
				{ start: 2, end: 12 },
				{ start: 16, end: 19 },
			],
		});
	});

	test("サロゲートペアを 1 文字として数える", () => {
		expect(
			textLayout([
				{
					type: "paragraph",
					children: [
						{ type: "text", value: "😀" },
						{
							type: "link",
							href: "https://example.com/",
							children: [{ type: "text", value: "a" }],
						},
					],
				},
			]).links,
		).toEqual([{ start: 1, end: 2 }]);
	});
});

describe("コードポイント単位の操作", () => {
	test("サロゲートペアを 1 文字として数える", () => {
		expect(codePointLength("a😀b")).toBe(3);
		expect(sliceCodePoints("a😀b", 1, 3)).toBe("😀b");
	});
});

describe("linkHrefs", () => {
	test("リストや強調の中のリンクも含めて、すべての URL を文書の順に返す", () => {
		expect(linkHrefs(blocks)).toEqual([
			"https://example.com/#subscriber",
			"https://example.com/#two",
		]);
	});
});
