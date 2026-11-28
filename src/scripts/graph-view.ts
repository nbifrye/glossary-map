import Graph from "graphology";
import Sigma from "sigma";
import { extremityArrow } from "sigma/rendering";
import {
	CLUSTER_COLORS,
	clusterColorIndex,
	OTHER_COLOR,
} from "../site/colors.ts";
import {
	CLUSTERINGS,
	type ClusteringId,
	type GraphData,
	type GraphEdge,
	type GraphNode,
	LAYOUTS,
	type LayoutId,
	layoutKey,
} from "../site/graph-data.ts";

const EDGE_COLOR = "#c3c2b7";
const VIEWS = ["full", "neighborhood"] as const;
type ViewId = (typeof VIEWS)[number];

/** URL で共有する表示の状態 */
interface ViewState {
	view: ViewId;
	cluster: ClusteringId;
	layout: LayoutId;
}

const wide = matchMedia("(min-width: 48rem)");

function pick<T extends string>(
	values: readonly T[],
	value: string | null,
	fallback: T,
): T {
	return values.find((candidate) => candidate === value) ?? fallback;
}

/** URL のクエリーパラメーターから表示の状態を読む。不正な値は既定値にする */
function readState(hasNeighborhood: boolean): ViewState {
	const params = new URLSearchParams(location.search);
	const defaultView: ViewId = hasNeighborhood ? "neighborhood" : "full";
	return {
		view: hasNeighborhood
			? pick(VIEWS, params.get("view"), defaultView)
			: "full",
		cluster: pick(CLUSTERINGS, params.get("cluster"), "louvain"),
		layout: pick(LAYOUTS, params.get("layout"), "forceatlas2"),
	};
}

/** 表示の状態を URL に書く。既定値と同じものは省く */
function stateUrl(state: ViewState, hasNeighborhood: boolean): string {
	const url = new URL(location.href);
	const defaults: ViewState = {
		view: hasNeighborhood ? "neighborhood" : "full",
		cluster: "louvain",
		layout: "forceatlas2",
	};
	for (const key of ["view", "cluster", "layout"] as const) {
		if (state[key] === defaults[key]) {
			url.searchParams.delete(key);
		} else {
			url.searchParams.set(key, state[key]);
		}
	}
	return url.href;
}

/** 選択したクラスタリングの用語群の一覧だけを表示する */
function showClusterLists(cluster: ClusteringId) {
	for (const list of document.querySelectorAll<HTMLElement>(
		"[data-clustering]",
	)) {
		list.hidden = list.dataset.clustering !== cluster;
	}
}

function element<K extends keyof HTMLElementTagNameMap>(
	name: K,
	text?: string,
): HTMLElementTagNameMap[K] {
	const node = document.createElement(name);
	if (text !== undefined) {
		node.textContent = text;
	}
	return node;
}

function termLink(base: string, node: GraphNode): HTMLAnchorElement {
	const link = element("a", node.heading);
	link.href = `${base}${node.slug}/${location.search}`;
	link.lang = "en";
	return link;
}

/** 線を選択したときに、その線に含まれる参照の根拠を表示する */
function showEdge(
	detail: HTMLElement,
	data: GraphData,
	edge: GraphEdge,
	termBase: string,
	criterionBase: string,
) {
	const source = data.nodes[edge.source];
	const target = data.nodes[edge.target];
	if (source === undefined || target === undefined) {
		return;
	}
	const heading = element("h3");
	heading.append(
		termLink(termBase, source),
		" から ",
		termLink(termBase, target),
		" への参照",
	);
	const list = element("ul");
	for (const reference of edge.references) {
		const item = element("li");
		const text = element("span", reference.text);
		text.lang = "en";
		const criterion = element("a");
		criterion.href = `${criterionBase}#criterion-${reference.criterion}`;
		criterion.append(element("code", reference.criterion));
		item.append(
			"「",
			text,
			`」 (${source.multipleDefinitions ? `定義 ${reference.definition + 1} の ` : ""}${reference.start + 1} 〜 ${reference.end} 文字目、基準: `,
			criterion,
			")",
		);
		list.append(item);
	}
	detail.replaceChildren(heading, list);
	detail.hidden = false;
}

function nodeColor(cluster: number, sizes: readonly number[]): string {
	const index = clusterColorIndex(cluster, sizes);
	return index === undefined
		? OTHER_COLOR
		: (CLUSTER_COLORS[index] ?? OTHER_COLOR);
}

function mount(root: HTMLElement) {
	const container = root.querySelector<HTMLElement>("[data-graph-canvas]");
	const status = root.querySelector<HTMLElement>("[data-graph-status]");
	const detail = root.querySelector<HTMLElement>("[data-graph-detail]");
	const form = root.querySelector<HTMLFormElement>("[data-graph-controls]");
	const { fullSrc, neighborhoodSrc, term, termBase, criterionBase } =
		root.dataset;
	if (
		container === null ||
		status === null ||
		detail === null ||
		form === null ||
		fullSrc === undefined ||
		termBase === undefined ||
		criterionBase === undefined
	) {
		return;
	}
	const hasNeighborhood = neighborhoodSrc !== undefined;
	const cache = new Map<string, Promise<GraphData>>();
	const load = (src: string) => {
		let data = cache.get(src);
		if (data === undefined) {
			data = fetch(src).then((response) => {
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}
				return response.json() as Promise<GraphData>;
			});
			cache.set(src, data);
		}
		return data;
	};
	let renderer: Sigma | undefined;
	let generation = 0;

	const render = async (state: ViewState) => {
		const current = ++generation;
		// 狭い画面では全体グラフを表示しない
		const view = hasNeighborhood && !wide.matches ? "neighborhood" : state.view;
		const src = view === "neighborhood" ? neighborhoodSrc : fullSrc;
		if (src === undefined || (view === "full" && !wide.matches)) {
			return;
		}
		status.textContent = "グラフを読み込んでいます。";
		try {
			const data = await load(src);
			if (current !== generation) {
				return;
			}
			const positions = data.layouts[layoutKey(state.layout, state.cluster)];
			const clustering = data.clusterings[state.cluster];
			if (positions === undefined) {
				throw new Error("配置の結果がありません");
			}
			const graph = new Graph({ type: "directed", multi: false });
			data.nodes.forEach((node, index) => {
				const selected = node.slug === term;
				graph.addNode(node.slug, {
					label: node.heading,
					x: positions[index * 2] ?? 0,
					y: positions[index * 2 + 1] ?? 0,
					size: (selected ? 6 : 3) + Math.sqrt(node.degree) * 1.5,
					color: nodeColor(clustering.assignment[index] ?? 0, clustering.sizes),
				});
			});
			data.edges.forEach((edge, index) => {
				const source = data.nodes[edge.source]?.slug;
				const target = data.nodes[edge.target]?.slug;
				if (source !== undefined && target !== undefined) {
					graph.addEdgeWithKey(String(index), source, target, {
						size: 1 + Math.log2(edge.references.length),
						color: EDGE_COLOR,
					});
				}
			});
			renderer?.kill();
			detail.hidden = true;
			renderer = new Sigma(graph, container, {
				primitives: {
					edges: { extremities: [extremityArrow()], defaultHead: "arrow" },
				},
				settings: {
					enableEdgeEvents: true,
					enableNodeDrag: true,
					// 配置ごとに座標の尺度が違っても同じ大きさで描くように、ノードの大きさを画面のピクセルで指定する
					itemSizesReference: "screen",
				},
			});
			renderer.on("clickNode", ({ node }) => {
				location.assign(`${termBase}${node}/${location.search}`);
			});
			renderer.on("clickEdge", ({ edge }) => {
				const selected = data.edges[Number(edge)];
				if (selected !== undefined) {
					showEdge(detail, data, selected, termBase, criterionBase);
				}
			});
			status.textContent = `${data.nodes.length} 語の用語と ${data.edges.length} 本の線を表示しています。`;
			root.dataset.graphState = "ready";
		} catch (error) {
			status.textContent = `グラフを表示できませんでした: ${error instanceof Error ? error.message : String(error)}`;
			root.dataset.graphState = "error";
		}
	};

	const setControls = (state: ViewState) => {
		for (const key of ["view", "cluster", "layout"] as const) {
			const control = form.elements.namedItem(key);
			if (control instanceof HTMLSelectElement) {
				control.value = state[key];
			}
		}
	};
	const formState = (): ViewState => {
		const value = (name: string) => {
			const control = form.elements.namedItem(name);
			return control instanceof HTMLSelectElement ? control.value : null;
		};
		return {
			view: hasNeighborhood
				? pick(VIEWS, value("view"), "neighborhood")
				: "full",
			cluster: pick(CLUSTERINGS, value("cluster"), "louvain"),
			layout: pick(LAYOUTS, value("layout"), "forceatlas2"),
		};
	};

	const apply = (state: ViewState) => {
		setControls(state);
		showClusterLists(state.cluster);
		void render(state);
	};

	form.addEventListener("change", () => {
		const state = formState();
		history.pushState(null, "", stateUrl(state, hasNeighborhood));
		showClusterLists(state.cluster);
		void render(state);
	});
	// JavaScript が動く場合は、送信せずにその場で表示を切り替える
	form.addEventListener("submit", (event) => event.preventDefault());
	addEventListener("popstate", () => apply(readState(hasNeighborhood)));
	wide.addEventListener("change", () => apply(readState(hasNeighborhood)));
	form.hidden = false;
	apply(readState(hasNeighborhood));
}

for (const root of document.querySelectorAll<HTMLElement>("[data-graph]")) {
	mount(root);
}
