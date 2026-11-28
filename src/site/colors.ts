/** 用語群の色。大きい用語群から順に割り当てる */
export const CLUSTER_COLORS = [
	"#2a78d6",
	"#eb6834",
	"#1baf7a",
	"#eda100",
	"#e87ba4",
	"#008300",
	"#6250d6",
	"#e34948",
] as const;

/** 色を割り当てない用語群の色 */
export const OTHER_COLOR = "#8a8984";

/**
 * 用語群に割り当てる色の番号。9 番目以降の用語群と、1 語だけの用語群には色を割り当てず、undefined を返す
 */
export function clusterColorIndex(
	cluster: number,
	sizes: readonly number[],
): number | undefined {
	return cluster < CLUSTER_COLORS.length && (sizes[cluster] ?? 0) >= 2
		? cluster
		: undefined;
}
