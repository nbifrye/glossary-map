import type { ClusteringId, GraphData } from "./graph-data.ts";

export const CLUSTERING_NAMES: Record<ClusteringId, string> = {
	louvain: "Louvain 法",
	leiden: "Leiden 法",
};

export interface ClusterSummary {
	/** 用語群の番号。0 から始まる */
	cluster: number;
	/** 用語群を構成する用語の、グラフのノードの番号 */
	members: number[];
	/** 用語群の中の線 */
	edges: GraphData["edges"];
}

/** クラスタリングの結果を、用語群ごとにまとめる。用語群は番号の順に並べる */
export function summarizeClusters(
	data: GraphData,
	clustering: ClusteringId,
): ClusterSummary[] {
	const { assignment, sizes } = data.clusterings[clustering];
	const summaries: ClusterSummary[] = sizes.map((_, cluster) => ({
		cluster,
		members: [],
		edges: [],
	}));
	assignment.forEach((cluster, node) => {
		summaries[cluster]?.members.push(node);
	});
	for (const edge of data.edges) {
		const cluster = assignment[edge.source];
		if (cluster !== undefined && cluster === assignment[edge.target]) {
			summaries[cluster]?.edges.push(edge);
		}
	}
	return summaries;
}

/** 用語集のページで、用語群の一覧の各項目に付ける ID */
export function clusterAnchor(clustering: ClusteringId, cluster: number) {
	return `cluster-${clustering}-${cluster + 1}`;
}
