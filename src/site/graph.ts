import { layout as dagreLayout, graphlib } from "@dagrejs/dagre";
import Graph, { UndirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Random from "java-random";
import { Clustering, LeidenAlgorithm, Network } from "networkanalysis-ts";
import type { SiteGlossary } from "./data.ts";
import {
	CLUSTERINGS,
	type ClusteringId,
	type ClusteringResult,
	type GraphData,
	type GraphEdge,
	type GraphNode,
	layoutKey,
} from "./graph-data.ts";

export * from "./graph-data.ts";

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

/** 向きを無視した、2 つの用語間の参照の数 */
function undirectedWeights(edges: GraphEdge[]): Map<string, number> {
	const weights = new Map<string, number>();
	for (const { source, target, references } of edges) {
		const key = source < target ? `${source}-${target}` : `${target}-${source}`;
		weights.set(key, (weights.get(key) ?? 0) + references.length);
	}
	return weights;
}

/** 用語群の番号を、大きい用語群から順に振り直す。同じ大きさなら、最初の用語の順にする */
function renumber(communities: number[]): ClusteringResult {
	const members = new Map<number, number[]>();
	communities.forEach((community, node) => {
		members.set(community, [...(members.get(community) ?? []), node]);
	});
	const ordered = [...members.values()].toSorted(
		(a, b) => b.length - a.length || (a[0] ?? 0) - (b[0] ?? 0),
	);
	const assignment = new Array<number>(communities.length).fill(0);
	ordered.forEach((group, cluster) => {
		for (const node of group) {
			assignment[node] = cluster;
		}
	});
	return { assignment, sizes: ordered.map((group) => group.length) };
}

function louvainClustering(count: number, edges: GraphEdge[]): number[] {
	const graph = new UndirectedGraph();
	for (let node = 0; node < count; node++) {
		graph.addNode(String(node));
	}
	for (const [key, weight] of undirectedWeights(edges)) {
		const [a, b] = key.split("-");
		graph.addEdge(a, b, { weight });
	}
	const communities = louvain(graph, {
		getEdgeWeight: "weight",
		rng: seededRandom(1),
	});
	return Array.from({ length: count }, (_, node) => communities[node] ?? -1);
}

/** Leiden 法の反復回数と、初期値を変えて試す回数 */
const LEIDEN_ITERATIONS = 50;
const LEIDEN_STARTS = 10;

function leidenClustering(count: number, edges: GraphEdge[]): number[] {
	const weights = [...undirectedWeights(edges)];
	if (weights.length === 0) {
		return Array.from({ length: count }, (_, node) => node);
	}
	const network = new Network({
		nNodes: count,
		setNodeWeightsToTotalEdgeWeights: true,
		edges: [
			weights.map(([key]) => Number(key.split("-")[0])),
			weights.map(([key]) => Number(key.split("-")[1])),
		],
		edgeWeights: weights.map(([, weight]) => weight),
		sortedEdges: false,
		checkIntegrity: true,
	});
	// ノードの重みを線の重みの合計にし、解像度を 1 / (2m) にすると、モジュラリティを最大化する
	const algorithm = new LeidenAlgorithm();
	algorithm.initializeBasedOnResolutionAndNIterationsAndRandomnessAndRandom(
		1 / (2 * network.getTotalEdgeWeight()),
		LEIDEN_ITERATIONS,
		LeidenAlgorithm.DEFAULT_RANDOMNESS,
		new Random(1),
	);
	let best: Clustering | undefined;
	let bestQuality = Number.NEGATIVE_INFINITY;
	for (let start = 0; start < LEIDEN_STARTS; start++) {
		const clustering = new Clustering({ nNodes: count });
		algorithm.improveClustering(network, clustering);
		const quality = algorithm.calcQuality(network, clustering);
		if (quality > bestQuality) {
			best = clustering;
			bestQuality = quality;
		}
	}
	return best?.getClusters() ?? [];
}

/** ForceAtlas2 による配置。初期位置は決まった種の疑似乱数で決める */
function forceAtlas2Layout(count: number, edges: GraphEdge[]): number[] {
	const random = seededRandom(2);
	const graph = new Graph({ type: "directed" });
	for (let node = 0; node < count; node++) {
		graph.addNode(String(node), { x: random() * 100, y: random() * 100 });
	}
	for (const edge of edges) {
		graph.addEdge(String(edge.source), String(edge.target), {
			weight: edge.references.length,
		});
	}
	const positions = forceAtlas2(graph, {
		iterations: LAYOUT_ITERATIONS,
		getEdgeWeight: "weight",
		settings: forceAtlas2.inferSettings(graph),
	});
	return Array.from({ length: count }, (_, node) => {
		const position = positions[node] ?? { x: 0, y: 0 };
		return [position.x, position.y];
	}).flat();
}

/**
 * 用語群別の配置。用語群ごとに、その用語群の中の線だけで ForceAtlas2 を適用し、
 * 用語群の大きさに応じた円の中に収める。円は大きい用語群から順に、重ならないように渦巻き状に並べる
 */
function clusterLayout(
	count: number,
	edges: GraphEdge[],
	assignment: number[],
): number[] {
	const groups = Map.groupBy(
		Array.from({ length: count }, (_, node) => node),
		(node) => assignment[node] ?? 0,
	);
	const result = new Array<number>(count * 2).fill(0);
	const placed: { x: number; y: number; radius: number }[] = [];
	const golden = Math.PI * (3 - Math.sqrt(5));
	for (const cluster of [...groups.keys()].toSorted((a, b) => a - b)) {
		const members = groups.get(cluster) ?? [];
		const local = new Map(members.map((node, i) => [node, i]));
		const inner = edges
			.filter(({ source, target }) => local.has(source) && local.has(target))
			.map((edge) => ({
				...edge,
				source: local.get(edge.source) ?? 0,
				target: local.get(edge.target) ?? 0,
			}));
		const positions =
			members.length === 1 ? [0, 0] : forceAtlas2Layout(members.length, inner);
		const radius = 10 * Math.sqrt(members.length);
		// 用語群の中の配置を、中心が原点で半径が radius の円に収める
		const xs = positions.filter((_, i) => i % 2 === 0);
		const ys = positions.filter((_, i) => i % 2 === 1);
		const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
		const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
		const extent = Math.max(
			...members.map((_, i) =>
				Math.hypot((xs[i] ?? 0) - cx, (ys[i] ?? 0) - cy),
			),
			1e-9,
		);
		const scale = members.length === 1 ? 0 : radius / extent;
		// 既に置いた円と重ならない位置が見つかるまで、渦巻きに沿って外へずらす
		let center = { x: 0, y: 0 };
		for (let step = 0; ; step++) {
			const distance = 2 * Math.sqrt(step) * 10;
			center = {
				x: distance * Math.cos(step * golden),
				y: distance * Math.sin(step * golden),
			};
			if (
				placed.every(
					(circle) =>
						Math.hypot(circle.x - center.x, circle.y - center.y) >=
						circle.radius + radius + 10,
				)
			) {
				break;
			}
		}
		placed.push({ ...center, radius });
		members.forEach((node, i) => {
			result[node * 2] = center.x + ((xs[i] ?? 0) - cx) * scale;
			result[node * 2 + 1] = center.y + ((ys[i] ?? 0) - cy) * scale;
		});
	}
	return result;
}

/**
 * 階層配置 (Sugiyama 法)。参照元を上、参照先を下に置く。
 * 循環を取り除くために向きを逆にした線も、描画では本来の向きで示す
 */
function hierarchyLayout(count: number, edges: GraphEdge[]): number[] {
	const graph = new graphlib.Graph();
	graph.setGraph({ rankdir: "TB", nodesep: 20, ranksep: 80 });
	graph.setDefaultEdgeLabel(() => ({}));
	for (let node = 0; node < count; node++) {
		graph.setNode(String(node), { width: 20, height: 20 });
	}
	for (const edge of edges) {
		graph.setEdge(String(edge.source), String(edge.target));
	}
	dagreLayout(graph);
	const points = Array.from({ length: count }, (_, node) => {
		const { x = 0, y = 0 } = graph.node(String(node)) ?? {};
		return { x, y };
	});
	// 1 つの層に多くの用語が並ぶと横に長くなりすぎるため、幅が高さの 1.5 倍を超える場合は縦に引き伸ばす
	const width =
		Math.max(...points.map(({ x }) => x)) -
		Math.min(...points.map(({ x }) => x));
	const height =
		Math.max(...points.map(({ y }) => y)) -
		Math.min(...points.map(({ y }) => y));
	const stretch =
		height > 0 && width > height * 1.5 ? width / (height * 1.5) : 1;
	// sigma では y が大きいほど上に描くため、上下を反転する
	return points.flatMap(({ x, y }) => [x, -y * stretch]);
}

/** データ量を抑えるため、座標を小数点以下 2 桁に丸める */
function round(values: number[]): number[] {
	return values.map((value) => Math.round(value * 100) / 100);
}

function computeLayouts(
	count: number,
	edges: GraphEdge[],
	clusterings: Record<ClusteringId, ClusteringResult>,
): Record<string, number[]> {
	const layouts: Record<string, number[]> = {
		forceatlas2: round(forceAtlas2Layout(count, edges)),
		hierarchy: round(hierarchyLayout(count, edges)),
	};
	for (const clustering of CLUSTERINGS) {
		layouts[layoutKey("clusters", clustering)] = round(
			clusterLayout(count, edges, clusterings[clustering].assignment),
		);
	}
	return layouts;
}

/**
 * 用語集の全体グラフを計算する。用語をノード、参照を線とし、同じ参照元から同じ参照先への参照は 1 本の線にまとめる。
 * 自分自身への参照は線にしない。ノードは常にスラッグの順に処理する
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

	const degrees = new Array<number>(slugs.length).fill(0);
	for (const [key] of undirectedWeights(edges)) {
		for (const node of key.split("-")) {
			degrees[Number(node)] = (degrees[Number(node)] ?? 0) + 1;
		}
	}
	const nodes = slugs.map((slug, i): GraphNode => {
		const term = entry.bySlug.get(slug)?.term;
		const heading = term?.heading ?? slug;
		const translation = term?.headingTranslation.text;
		return {
			slug,
			heading,
			...(translation !== undefined && translation !== heading
				? { translation }
				: {}),
			degree: degrees[i] ?? 0,
			...((term?.definitions.length ?? 0) > 1
				? { multipleDefinitions: true as const }
				: {}),
		};
	});

	// クラスタリングでは参照の向きを無視し、2 つの用語間の参照の数を重みとする
	const clusterings = {
		louvain: renumber(louvainClustering(slugs.length, edges)),
		leiden: renumber(leidenClustering(slugs.length, edges)),
	};
	return {
		nodes,
		edges,
		clusterings,
		layouts: computeLayouts(slugs.length, edges, clusterings),
	};
}

/**
 * 周辺グラフを計算する。選択した用語と、その参照先・参照元の用語から成り、これらの用語間の線をすべて含む。
 * 用語群は全体グラフの結果をそのまま使い、配置は部分グラフに対して計算し直す
 */
export function computeNeighborhood(full: GraphData, slug: string): GraphData {
	const center = full.nodes.findIndex((node) => node.slug === slug);
	if (center < 0) {
		throw new Error(`用語 ${slug} がグラフにありません`);
	}
	const included = new Set([center]);
	for (const { source, target } of full.edges) {
		if (source === center) {
			included.add(target);
		}
		if (target === center) {
			included.add(source);
		}
	}
	// 全体グラフでの順 (スラッグの順) を保つ
	const members = [...included].toSorted((a, b) => a - b);
	const local = new Map(members.map((node, i) => [node, i]));
	const edges = full.edges
		.filter(({ source, target }) => local.has(source) && local.has(target))
		.map((edge) => ({
			...edge,
			source: local.get(edge.source) ?? 0,
			target: local.get(edge.target) ?? 0,
		}));
	const clusterings = Object.fromEntries(
		CLUSTERINGS.map((clustering) => [
			clustering,
			{
				assignment: members.map(
					(node) => full.clusterings[clustering].assignment[node] ?? 0,
				),
				sizes: full.clusterings[clustering].sizes,
			},
		]),
	) as Record<ClusteringId, ClusteringResult>;
	return {
		nodes: members.map((node) => full.nodes[node] as GraphNode),
		edges,
		clusterings,
		layouts: computeLayouts(members.length, edges, clusterings),
	};
}

const cache = new Map<string, GraphData>();

/** 用語集の全体グラフを、ビルド中に 1 回だけ計算する */
export function glossaryGraph(entry: SiteGlossary): GraphData {
	const cached = cache.get(entry.glossary.id);
	if (cached !== undefined) {
		return cached;
	}
	const graph = computeGraph(entry);
	cache.set(entry.glossary.id, graph);
	return graph;
}
