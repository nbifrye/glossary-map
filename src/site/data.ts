import { loadGlossaries } from "../data/load.ts";
import { slugify } from "../data/slug.ts";
import type { Glossary, Reference, Term } from "../data/types.ts";
import { validateGlossary } from "../data/validate.ts";

export interface SiteTerm {
	slug: string;
	term: Term;
}

/** ある用語を参照している、ほかの用語の参照 */
export interface IncomingReference {
	source: SiteTerm;
	reference: Reference;
}

export interface SiteGlossary {
	glossary: Glossary;
	/** 見出しの順に並べた用語 */
	terms: SiteTerm[];
	bySlug: Map<string, SiteTerm>;
	/** 参照先のスラッグごとの、参照元の参照 */
	incoming: Map<string, IncomingReference[]>;
}

function compareHeadings(a: SiteTerm, b: SiteTerm): number {
	return (
		a.term.heading.localeCompare(b.term.heading, "en", {
			sensitivity: "base",
		}) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)
	);
}

let cache: Promise<SiteGlossary[]> | undefined;

/**
 * glossaries ディレクトリの用語集を読み込む。
 * 検証で問題が見つかった場合は、不完全なサイトを生成しないように例外を投げる
 */
export function loadSite(root = "glossaries"): Promise<SiteGlossary[]> {
	cache ??= load(root);
	return cache;
}

async function load(root: string): Promise<SiteGlossary[]> {
	const inputs = await loadGlossaries(root);
	const issues = inputs.flatMap((input) =>
		validateGlossary(input).map(
			(issue) => `${input.directory}/${issue.file}: ${issue.message}`,
		),
	);
	if (issues.length > 0) {
		throw new Error(`用語集に問題があります:\n${issues.join("\n")}`);
	}
	return inputs.map((input) => {
		const glossary = (input.glossary as { data: Glossary }).data;
		const terms = input.terms
			.map(({ content }) => {
				const term = (content as { data: Term }).data;
				return { slug: term.slug ?? slugify(term.heading), term };
			})
			.toSorted(compareHeadings);
		const bySlug = new Map(terms.map((item) => [item.slug, item]));
		const incoming = new Map<string, IncomingReference[]>();
		for (const source of terms) {
			for (const reference of source.term.references) {
				const list = incoming.get(reference.target.term) ?? [];
				list.push({ source, reference });
				incoming.set(reference.target.term, list);
			}
		}
		return { glossary, terms, bySlug, incoming };
	});
}
