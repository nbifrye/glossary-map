import Graph, { UndirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { SiteGlossary } from "./data.ts";

/** グラフの線に含まれる参照の根拠 */
export interface EdgeReference {
	definition: number;
	start: number;
	end: number;
	text: string;
	criterion: string;
}

export interface GraphNode {
	slug: string;
	heading: string;
	/** 見出しの訳文。見出しと同じ場合は省く */
	translation?: string;
	x: number;
	y: number;
	/** 用語群の番号。大きい用語群から順に 0 から振る */
	cluster: number;
	/** 参照先と参照元の用語の数 */
	degree: number;
	/** 定義が複数ある場合に true。根拠の位置に定義の番号を添えるために使う */
	multipleDefinitions?: true;
}

export interface GraphEdge {
	/** nodes の番号 */
	source: number;
	target: number;
	references: EdgeReference[];
}

export interface GraphData {
	nodes: GraphNode[];
	edges: GraphEdge[];
	/** 用語群ごとの用語の数 */
	clusterSizes: number[];
}

/** ForceAtlas2 の反復回数。時間ではなく回数で打ち切り、同じデータから同じ配置を得る */
const LAYOUT_ITERATIONS = 500;

/** 決まった値で初期化する疑似乱数生成器 (mulberry32) */
export function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 用語集のグラフを計算する。用語をノード、参照を辺とし、同じ参照元から同じ参照先への参照は 1 本の辺にまとめる。
 * 自分自身への参照は辺にしない。ノードは常にスラッグの順に処理する
 */
export function computeGraph(entry: SiteGlossary): GraphData {
	const slugs = entry.terms.map((item) => item.slug).toSorted(compare);
	const index = new Map(slugs.map((slug, i) => [slug, i]));

	const edgeMap = new Map<string, GraphEdge>();
	for (const slug of slugs) {
		const item = entry.bySlug.get(slug);
		for (const reference of item?.term.references ?? []) {
			const target = reference.target.term;
			if (target === slug) {
				continue;
			}
			const key = `${slug}\u0000${target}`;
			const edge = edgeMap.get(key) ?? {
				source: index.get(slug) ?? -1,
				target: index.get(target) ?? -1,
				references: [],
			};
			edge.references.push({
				definition: reference.definition,
				start: reference.start,
				end: reference.end,
				text: reference.text,
				criterion: reference.criterion,
			});
			edgeMap.set(key, edge);
		}
	}
	const edges = [...edgeMap.values()].toSorted(
		(a, b) => a.source - b.source || a.target - b.target,
	);

	// クラスタリングでは参照の向きを無視し、2 つの用語間の参照の数を重みとする
	const undirected = new UndirectedGraph();
	for (const slug of slugs) {
		undirected.addNode(slug);
	}
	for (const edge of edges) {
		const source = slugs[edge.source] ?? "";
		const target = slugs[edge.target] ?? "";
		const weight = edge.references.length;
		if (undirected.hasEdge(source, target)) {
			undirected.updateEdgeAttribute(
				source,
				target,
				"weight",
				(value: number) => value + weight,
			);
		} else {
			undirected.addEdge(source, target, { weight });
		}
	}
	const communities = louvain(undirected, {
		getEdgeWeight: "weight",
		rng: seededRandom(1),
	});

	// 用語群の番号を、大きい用語群から順に振り直す。同じ大きさなら、最初の用語のスラッグの順にする
	const members = new Map<number, string[]>();
	for (const slug of slugs) {
		const community = communities[slug] ?? -1;
		members.set(community, [...(members.get(community) ?? []), slug]);
	}
	const ordered = [...members.values()].toSorted(
		(a, b) => b.length - a.length || compare(a[0] ?? "", b[0] ?? ""),
	);
	const clusterOf = new Map<string, number>();
	ordered.forEach((group, cluster) => {
		for (const slug of group) {
			clusterOf.set(slug, cluster);
		}
	});

	// 配置は、参照の向きを含む有向グラフに ForceAtlas2 を適用して求める
	const random = seededRandom(2);
	const directed = new Graph({ type: "directed" });
	for (const slug of slugs) {
		directed.addNode(slug, { x: random() * 100, y: random() * 100 });
	}
	for (const edge of edges) {
		directed.addEdge(slugs[edge.source], slugs[edge.target], {
			weight: edge.references.length,
		});
	}
	const positions = forceAtlas2(directed, {
		iterations: LAYOUT_ITERATIONS,
		getEdgeWeight: "weight",
		settings: forceAtlas2.inferSettings(directed),
	});

	const nodes = slugs.map((slug): GraphNode => {
		const term = entry.bySlug.get(slug)?.term;
		const heading = term?.heading ?? slug;
		const translation = term?.headingTranslation.text;
		const position = positions[slug] ?? { x: 0, y: 0 };
		return {
			slug,
			heading,
			...(translation !== undefined && translation !== heading
				? { translation }
				: {}),
			x: round(position.x),
			y: round(position.y),
			cluster: clusterOf.get(slug) ?? 0,
			degree: directed.degreeWithoutSelfLoops(slug),
			...((term?.definitions.length ?? 0) > 1
				? { multipleDefinitions: true as const }
				: {}),
		};
	});
	return { nodes, edges, clusterSizes: ordered.map((group) => group.length) };
}

/** データ量を抑えるため、座標を小数点以下 2 桁に丸める */
function round(value: number): number {
	return Math.round(value * 100) / 100;
}
