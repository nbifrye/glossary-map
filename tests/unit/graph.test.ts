import { describe, expect, test } from "vitest";
import type { Term } from "../../src/data/types.ts";
import type { SiteGlossary, SiteTerm } from "../../src/site/data.ts";
import { computeGraph, seededRandom } from "../../src/site/graph.ts";

/** 参照先のスラッグの一覧から、用語集を組み立てる */
function glossary(terms: Record<string, string[]>): SiteGlossary {
	const items: SiteTerm[] = Object.entries(terms).map(([slug, targets]) => {
		const term: Term = {
			heading: slug,
			headingTranslation: { text: `${slug} の訳`, sourceHash: "" },
			definitions: [
				{
					location: { label: "1" },
					source: [
						{ type: "paragraph", children: [{ type: "text", value: "x" }] },
					],
					translation: { content: [], sourceHash: "" },
				},
			],
			references: targets.map((target, index) => ({
				definition: 0,
				target: { glossary: "example", term: target },
				start: index,
				end: index + 1,
				text: target,
				criterion: "emphasis",
			})),
		};
		return { slug, term };
	});
	return {
		glossary: {
			id: "example",
			title: "例",
			source: {
				name: "Example",
				version: "1",
				published: "2026",
				url: "https://example.com/",
				retrieved: "2026",
			},
			criteria: [{ id: "emphasis", description: "強調" }],
		},
		terms: items,
		bySlug: new Map(items.map((item) => [item.slug, item])),
		incoming: new Map(),
	};
}

describe("computeGraph", () => {
	test("同じ参照元から同じ参照先への参照を 1 本の線にまとめ、自身への参照は線にしない", () => {
		const data = computeGraph(
			glossary({ a: ["b", "b", "a"], b: [], c: ["a"] }),
		);
		expect(data.nodes.map((node) => node.slug)).toEqual(["a", "b", "c"]);
		expect(
			data.edges.map(({ source, target, references }) => [
				source,
				target,
				references.length,
			]),
		).toEqual([
			[0, 1, 2],
			[2, 0, 1],
		]);
		expect(data.nodes.map((node) => node.degree)).toEqual([2, 1, 1]);
	});

	test("同じデータからは同じ結果を得る", () => {
		const terms = {
			a: ["b", "c"],
			b: ["c"],
			c: ["a"],
			d: ["e"],
			e: ["f"],
			f: ["d"],
			g: [],
		};
		expect(computeGraph(glossary(terms))).toEqual(
			computeGraph(glossary(terms)),
		);
	});

	test("用語群の番号を、大きい用語群から順に振る", () => {
		const data = computeGraph(
			glossary({
				a: [],
				b: ["c"],
				c: ["d"],
				d: ["b"],
				e: ["f"],
				f: [],
			}),
		);
		expect(data.clusterSizes).toEqual([3, 2, 1]);
		const cluster = (slug: string) =>
			data.nodes.find((node) => node.slug === slug)?.cluster;
		expect([cluster("b"), cluster("c"), cluster("d")]).toEqual([0, 0, 0]);
		expect([cluster("e"), cluster("f")]).toEqual([1, 1]);
		expect(cluster("a")).toBe(2);
	});

	test("見出しと同じ訳文は省く", () => {
		const entry = glossary({ a: [] });
		const item = entry.bySlug.get("a");
		if (item) {
			item.term.headingTranslation.text = "a";
		}
		expect(computeGraph(entry).nodes[0]?.translation).toBeUndefined();
	});
});

test("seededRandom は同じ種から同じ乱数列を返す", () => {
	const a = seededRandom(42);
	const b = seededRandom(42);
	const values = [a(), a(), a()];
	expect([b(), b(), b()]).toEqual(values);
	for (const value of values) {
		expect(value).toBeGreaterThanOrEqual(0);
		expect(value).toBeLessThan(1);
	}
});
