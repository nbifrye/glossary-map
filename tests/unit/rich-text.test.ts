import { describe, expect, test } from "vitest";
import type { Block } from "../../src/data/types.ts";
import { applyReferences } from "../../src/site/rich-text.ts";

const text = (value: string) => ({ type: "text", value }) as const;

describe("applyReferences", () => {
	test("参照がなければ原文の構造をそのまま返す", () => {
		const blocks: Block[] = [
			{
				type: "paragraph",
				children: [
					text("A "),
					{ type: "emphasis", children: [text("b")] },
					{ type: "link", href: "https://example.com/", children: [text("c")] },
				],
			},
		];
		expect(applyReferences(blocks, [])).toEqual(blocks);
	});

	test("文字列の一部を参照先へのリンクにする", () => {
		const blocks: Block[] = [
			{ type: "paragraph", children: [text("A service of a subscriber.")] },
		];
		expect(
			applyReferences(blocks, [{ start: 15, end: 25, href: "/subscriber/" }]),
		).toEqual([
			{
				type: "paragraph",
				children: [
					text("A service of a "),
					{
						type: "reference",
						href: "/subscriber/",
						children: [text("subscriber")],
					},
					text("."),
				],
			},
		]);
	});

	test("強調された語句を参照にするときは、強調を参照の中に残す", () => {
		const blocks: Block[] = [
			{
				type: "paragraph",
				children: [
					text("A "),
					{ type: "emphasis", children: [text("subscriber")] },
					text("."),
				],
			},
		];
		expect(
			applyReferences(blocks, [{ start: 2, end: 12, href: "/subscriber/" }]),
		).toEqual([
			{
				type: "paragraph",
				children: [
					text("A "),
					{
						type: "reference",
						href: "/subscriber/",
						children: [{ type: "emphasis", children: [text("subscriber")] }],
					},
					text("."),
				],
			},
		]);
	});

	test("範囲と一致する原文のリンクは、参照先へのリンクに置き換える", () => {
		const blocks: Block[] = [
			{
				type: "paragraph",
				children: [
					{
						type: "link",
						href: "https://example.com/#subscriber",
						children: [{ type: "emphasis", children: [text("subscriber")] }],
					},
				],
			},
		];
		expect(
			applyReferences(blocks, [{ start: 0, end: 10, href: "/subscriber/" }]),
		).toEqual([
			{
				type: "paragraph",
				children: [
					{
						type: "reference",
						href: "/subscriber/",
						children: [{ type: "emphasis", children: [text("subscriber")] }],
					},
				],
			},
		]);
	});

	test("強調の境界をまたぐ範囲では、強調を分けて参照を作る", () => {
		const blocks: Block[] = [
			{
				type: "paragraph",
				children: [{ type: "emphasis", children: [text("a b")] }, text(" c")],
			},
		];
		expect(
			applyReferences(blocks, [{ start: 2, end: 5, href: "/b-c/" }]),
		).toEqual([
			{
				type: "paragraph",
				children: [
					{ type: "emphasis", children: [text("a ")] },
					{
						type: "reference",
						href: "/b-c/",
						children: [{ type: "emphasis", children: [text("b")] }, text(" c")],
					},
				],
			},
		]);
	});

	test("位置は段落やリストの項目をまたいで、区切り文字なしで数える", () => {
		const blocks: Block[] = [
			{ type: "paragraph", children: [text("ab")] },
			{
				type: "list",
				ordered: true,
				items: [
					[{ type: "paragraph", children: [text("cd")] }],
					[{ type: "paragraph", children: [text("e😀f")] }],
				],
			},
		];
		expect(
			applyReferences(blocks, [
				{ start: 3, end: 4, href: "/d/" },
				{ start: 5, end: 7, href: "/emoji-f/" },
			]),
		).toEqual([
			{ type: "paragraph", children: [text("ab")] },
			{
				type: "list",
				ordered: true,
				items: [
					[
						{
							type: "paragraph",
							children: [
								text("c"),
								{ type: "reference", href: "/d/", children: [text("d")] },
							],
						},
					],
					[
						{
							type: "paragraph",
							children: [
								text("e"),
								{
									type: "reference",
									href: "/emoji-f/",
									children: [text("😀f")],
								},
							],
						},
					],
				],
			},
		]);
	});

	test("接している 2 つの参照を別々のリンクにする", () => {
		const blocks: Block[] = [{ type: "paragraph", children: [text("ab")] }];
		expect(
			applyReferences(blocks, [
				{ start: 0, end: 1, href: "/a/" },
				{ start: 1, end: 2, href: "/b/" },
			]),
		).toEqual([
			{
				type: "paragraph",
				children: [
					{ type: "reference", href: "/a/", children: [text("a")] },
					{ type: "reference", href: "/b/", children: [text("b")] },
				],
			},
		]);
	});

	test("位置の順に並んでいない参照も、それぞれの範囲をリンクにする", () => {
		const blocks: Block[] = [
			{ type: "paragraph", children: [text("a b")] },
			{ type: "paragraph", children: [text("c")] },
		];
		expect(
			applyReferences(blocks, [
				{ start: 3, end: 4, href: "/c/" },
				{ start: 0, end: 1, href: "/a/" },
				{ start: 2, end: 3, href: "/b/" },
			]),
		).toEqual([
			{
				type: "paragraph",
				children: [
					{ type: "reference", href: "/a/", children: [text("a")] },
					text(" "),
					{ type: "reference", href: "/b/", children: [text("b")] },
				],
			},
			{
				type: "paragraph",
				children: [{ type: "reference", href: "/c/", children: [text("c")] }],
			},
		]);
	});
});
