import { describe, expect, test } from "vitest";
import type { Term } from "../../src/data/types.ts";
import { summarizeClusters } from "../../src/site/clusters.ts";
import type { SiteGlossary, SiteTerm } from "../../src/site/data.ts";
import {
	CLUSTERINGS,
	computeGraph,
	computeNeighborhood,
	LAYOUTS,
	layoutKey,
	seededRandom,
} from "../../src/site/graph.ts";

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

	test.each(CLUSTERINGS)(
		"%s: 用語群の番号を、大きい用語群から順に振る",
		(clustering) => {
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
			const { assignment, sizes } = data.clusterings[clustering];
			expect(sizes).toEqual([3, 2, 1]);
			// ノードはスラッグの順 (a 〜 f) に並ぶ
			expect(assignment).toEqual([2, 0, 0, 0, 1, 1]);
		},
	);

	test("すべての配置で、ノードごとに座標を持つ", () => {
		const data = computeGraph(
			glossary({ a: ["b"], b: ["c"], c: ["a"], d: ["a"], e: [] }),
		);
		for (const clustering of CLUSTERINGS) {
			for (const layout of LAYOUTS) {
				const positions = data.layouts[layoutKey(layout, clustering)];
				expect(positions).toHaveLength(data.nodes.length * 2);
				expect(positions?.every(Number.isFinite)).toBe(true);
			}
		}
	});

	test("階層配置では、参照元を参照先より上に置く", () => {
		const data = computeGraph(glossary({ a: ["b"], b: ["c"], c: [] }));
		const y = (node: number) => data.layouts.hierarchy?.[node * 2 + 1] ?? 0;
		expect(y(0)).toBeGreaterThan(y(1));
		expect(y(1)).toBeGreaterThan(y(2));
	});

	test("周辺グラフは、選択した用語と参照先・参照元の用語と、それらの間の線から成る", () => {
		const full = computeGraph(
			glossary({ a: ["b"], b: ["c"], c: ["a"], d: ["b"], e: ["d"] }),
		);
		const neighborhood = computeNeighborhood(full, "b");
		expect(neighborhood.nodes.map(({ slug }) => slug)).toEqual([
			"a",
			"b",
			"c",
			"d",
		]);
		expect(
			neighborhood.edges.map(({ source, target }) => [source, target]),
		).toEqual([
			[0, 1],
			[1, 2],
			[2, 0],
			[3, 1],
		]);
		// 用語群は全体グラフの結果を使う
		for (const clustering of CLUSTERINGS) {
			expect(neighborhood.clusterings[clustering].sizes).toEqual(
				full.clusterings[clustering].sizes,
			);
		}
		expect(neighborhood.layouts.forceatlas2).toHaveLength(8);
	});

	test("用語群ごとに、構成する用語と用語群内の線をまとめる", () => {
		const data = computeGraph(
			glossary({ a: [], b: ["c"], c: ["d"], d: ["b"], e: ["f", "b"], f: [] }),
		);
		const [first] = summarizeClusters(data, "louvain");
		expect(first?.members).toEqual([1, 2, 3]);
		expect(first?.edges.map(({ source, target }) => [source, target])).toEqual([
			[1, 2],
			[2, 3],
			[3, 1],
		]);
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
