import type { APIRoute, GetStaticPaths } from "astro";
import { loadSite, type SiteGlossary } from "../../site/data.ts";
import { computeGraph } from "../../site/graph.ts";

export const getStaticPaths = (async () => {
	const site = await loadSite();
	return site.map((entry) => ({
		params: { glossary: entry.glossary.id },
		props: { entry },
	}));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ entry: SiteGlossary }> = ({ props }) =>
	new Response(JSON.stringify(computeGraph(props.entry)), {
		headers: { "Content-Type": "application/json" },
	});
