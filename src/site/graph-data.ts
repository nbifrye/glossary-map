/** グラフのデータの形式。ブラウザーでも読み込むため、ビルド時の計算に使うライブラリには依存しない */

export const CLUSTERINGS = ["louvain", "leiden"] as const;
export type ClusteringId = (typeof CLUSTERINGS)[number];

export const LAYOUTS = ["forceatlas2", "clusters", "hierarchy"] as const;
export type LayoutId = (typeof LAYOUTS)[number];

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
	/** 全体グラフでの、参照先と参照元の用語の数 */
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

export interface ClusteringResult {
	/** ノードごとの用語群の番号。大きい用語群から順に 0 から振る */
	assignment: number[];
	/** 全体グラフでの、用語群ごとの用語の数 */
	sizes: number[];
}

export interface GraphData {
	nodes: GraphNode[];
	edges: GraphEdge[];
	clusterings: Record<ClusteringId, ClusteringResult>;
	/** 配置のキー (layoutKey で求める) ごとの座標。ノードの順に x と y を並べる */
	layouts: Record<string, number[]>;
}

/** 配置のキー。用語群別の配置は、クラスタリングごとに別の結果を持つ */
export function layoutKey(layout: LayoutId, clustering: ClusteringId): string {
	return layout === "clusters" ? `clusters-${clustering}` : layout;
}
