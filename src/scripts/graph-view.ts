import Graph from "graphology";
import Sigma from "sigma";
import { extremityArrow } from "sigma/rendering";
import type { GraphData, GraphEdge, GraphNode } from "../site/graph.ts";

/** 用語群の色。大きい用語群から順に割り当て、9 番目以降の用語群は OTHER_COLOR にする */
const CLUSTER_COLORS = [
	"#2a78d6",
	"#eb6834",
	"#1baf7a",
	"#eda100",
	"#e87ba4",
	"#008300",
	"#6250d6",
	"#e34948",
];
const OTHER_COLOR = "#8a8984";
const EDGE_COLOR = "#c3c2b7";

function nodeColor(node: GraphNode, clusterSizes: number[]): string {
	// 1 語だけの用語群は、まとまりを表さないため色を付けない
	if ((clusterSizes[node.cluster] ?? 0) < 2) {
		return OTHER_COLOR;
	}
	return CLUSTER_COLORS[node.cluster] ?? OTHER_COLOR;
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
	link.href = `${base}${node.slug}/`;
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

async function mount(root: HTMLElement) {
	const container = root.querySelector<HTMLElement>("[data-graph-canvas]");
	const status = root.querySelector<HTMLElement>("[data-graph-status]");
	const detail = root.querySelector<HTMLElement>("[data-graph-detail]");
	const { src, termBase, criterionBase } = root.dataset;
	if (
		container === null ||
		status === null ||
		detail === null ||
		src === undefined ||
		termBase === undefined ||
		criterionBase === undefined
	) {
		return;
	}
	try {
		const response = await fetch(src);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		const data = (await response.json()) as GraphData;
		const graph = new Graph({ type: "directed", multi: false });
		for (const node of data.nodes) {
			graph.addNode(node.slug, {
				label: node.heading,
				x: node.x,
				y: node.y,
				size: 3 + Math.sqrt(node.degree) * 1.5,
				color: nodeColor(node, data.clusterSizes),
			});
		}
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
		const renderer = new Sigma(graph, container, {
			primitives: {
				edges: { extremities: [extremityArrow()], defaultHead: "arrow" },
			},
			settings: { enableEdgeEvents: true, enableNodeDrag: true },
		});
		renderer.on("clickNode", ({ node }) => {
			location.assign(`${termBase}${node}/`);
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
}

// 狭い画面では全体グラフを表示しない
const wide = matchMedia("(min-width: 48rem)");
for (const root of document.querySelectorAll<HTMLElement>("[data-graph]")) {
	if (wide.matches) {
		void mount(root);
	} else {
		wide.addEventListener("change", () => void mount(root), { once: true });
	}
}
