import type { APIRoute, GetStaticPaths } from "astro";
import { loadSite, type SiteGlossary } from "../../../../site/data.ts";
import { computeNeighborhood, glossaryGraph } from "../../../../site/graph.ts";

export const getStaticPaths = (async () => {
	const site = await loadSite();
	return site.flatMap((entry) =>
		entry.terms.map((item) => ({
			params: { glossary: entry.glossary.id, term: item.slug },
			props: { entry, slug: item.slug },
		})),
	);
}) satisfies GetStaticPaths;

/** 選択した用語の周辺グラフ。その用語のページを開いたときにだけ読み込む */
export const GET: APIRoute<{ entry: SiteGlossary; slug: string }> = ({
	props,
}) =>
	new Response(
		JSON.stringify(computeNeighborhood(glossaryGraph(props.entry), props.slug)),
		{ headers: { "Content-Type": "application/json" } },
	);
