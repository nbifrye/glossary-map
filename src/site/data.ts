import { loadGlossaries } from "../data/load.ts";
import type { Glossary, Reference, Term } from "../data/types.ts";
import { validateGlossary } from "../data/validate.ts";

export interface SiteTerm {
	slug: string;
	/** 参照を、定義の順と原文中の位置の順に並べ替えた用語 */
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

function compareReferences(a: Reference, b: Reference): number {
	return a.definition - b.definition || a.start - b.start;
}

const cache = new Map<string, Promise<SiteGlossary[]>>();

/**
 * glossaries ディレクトリの用語集を読み込む。
 * 検証で問題が見つかった場合は、不完全なサイトを生成しないように例外を投げる。
 * 読み込みに失敗した結果は、用語集を直してから読み込み直せるように保持しない
 */
export function loadSite(root = "glossaries"): Promise<SiteGlossary[]> {
	let site = cache.get(root);
	if (site === undefined) {
		site = load(root);
		cache.set(root, site);
		site.catch(() => cache.delete(root));
	}
	return site;
}

async function load(root: string): Promise<SiteGlossary[]> {
	const inputs = await loadGlossaries(root);
	const issues = inputs.flatMap((input) =>
		validateGlossary(input).map(
			(issue) => `${root}/${input.directory}/${issue.file}: ${issue.message}`,
		),
	);
	if (issues.length > 0) {
		throw new Error(`用語集に問題があります:\n${issues.join("\n")}`);
	}
	return inputs.map((input) => {
		const glossary = (input.glossary as { data: Glossary }).data;
		// 検証済みのため、ファイル名から拡張子を除いたものがスラッグと一致する
		const terms = input.terms
			.map(({ fileName, content }) => {
				const term = (content as { data: Term }).data;
				return {
					slug: fileName.slice(0, -".json".length),
					term: {
						...term,
						references: term.references.toSorted(compareReferences),
					},
				};
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
