import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import glossarySchema from "../../schemas/glossary.schema.json" with {
	type: "json",
};
import termSchema from "../../schemas/term.schema.json" with { type: "json" };
import { definitionHash, headingHash } from "./hash.ts";
import { slugify } from "./slug.ts";
import {
	codePointLength,
	linkHrefs,
	plainText,
	sliceCodePoints,
} from "./text.ts";
import type { Glossary, Term } from "./types.ts";

export interface Issue {
	/** 用語集のディレクトリからの相対パス */
	file: string;
	message: string;
}

export interface GlossaryInput {
	/** 用語集のディレクトリ名 */
	directory: string;
	glossary: unknown;
	/** terms ディレクトリにあるファイル */
	terms: { fileName: string; data: unknown }[];
}

const ajv = new Ajv2020({ allErrors: true });
const isGlossary = ajv.compile<Glossary>(glossarySchema);
const isTerm = ajv.compile<Term>(termSchema);

function schemaIssues(
	file: string,
	errors: ErrorObject[] | null | undefined,
): Issue[] {
	return (errors ?? []).map((error) => ({
		file,
		message: `形式が正しくありません: ${error.instancePath || "/"} ${error.message ?? ""}`,
	}));
}

/** リンクの URL が http・https か、サイト内の相対 URL であるか */
export function isSafeHref(href: string): boolean {
	try {
		const { protocol } = new URL(href, "https://example.invalid/");
		return protocol === "https:" || protocol === "http:";
	} catch {
		return false;
	}
}

function checkTerm(
	file: string,
	fileName: string,
	term: Term,
	glossary: Glossary,
	slugs: Set<string>,
): Issue[] {
	const issues: Issue[] = [];
	const report = (message: string) => issues.push({ file, message });

	const slug = slugify(term.heading);
	if (slug === "") {
		report(`見出し "${term.heading}" からスラッグを作れません`);
	} else if (fileName !== `${slug}.json`) {
		report(`ファイル名は ${slug}.json にしてください`);
	}

	const expectedHeadingHash = headingHash(term.heading);
	if (term.headingTranslation.sourceHash !== expectedHeadingHash) {
		report(
			`見出しの訳文が現在の見出しに対応していません。見出しのハッシュ値は ${expectedHeadingHash} です`,
		);
	}

	term.definitions.forEach((definition, index) => {
		const expectedHash = definitionHash(definition.source);
		if (definition.translation.sourceHash !== expectedHash) {
			report(
				`definitions[${index}] の訳文が現在の原文に対応していません。原文のハッシュ値は ${expectedHash} です`,
			);
		}
		const hrefs = [
			...linkHrefs(definition.source),
			...linkHrefs(definition.translation.content),
		];
		for (const href of hrefs) {
			if (!isSafeHref(href)) {
				report(`definitions[${index}] に使えない URL があります: ${href}`);
			}
		}
	});

	const criteria = new Set(glossary.criteria.map((criterion) => criterion.id));
	const ranges = new Map<number, { start: number; end: number }[]>();
	term.references.forEach((reference, index) => {
		const label = `references[${index}]`;
		const definition = term.definitions[reference.definition];
		if (definition === undefined) {
			report(`${label} の参照元の定義 ${reference.definition} がありません`);
			return;
		}
		if (reference.target.glossary !== glossary.id) {
			report(`${label} の参照先は、同じ用語集の用語にしてください`);
		} else if (!slugs.has(reference.target.term)) {
			report(`${label} の参照先の用語 ${reference.target.term} がありません`);
		}
		if (!criteria.has(reference.criterion)) {
			report(`${label} の基準 ${reference.criterion} が用語集にありません`);
		}
		const text = plainText(definition.source);
		if (
			reference.start >= reference.end ||
			reference.end > codePointLength(text)
		) {
			report(`${label} の位置が原文の範囲外です`);
			return;
		}
		const actual = sliceCodePoints(text, reference.start, reference.end);
		if (actual !== reference.text) {
			report(
				`${label} の位置にある原文は "${actual}" で、記録された表現 "${reference.text}" と一致しません`,
			);
			return;
		}
		const list = ranges.get(reference.definition) ?? [];
		list.push({ start: reference.start, end: reference.end });
		ranges.set(reference.definition, list);
	});

	for (const [definition, list] of ranges) {
		const sorted = list.toSorted((a, b) => a.start - b.start);
		for (let i = 1; i < sorted.length; i++) {
			const previous = sorted[i - 1];
			const current = sorted[i];
			if (previous && current && current.start < previous.end) {
				report(`definitions[${definition}] で参照の範囲が重なっています`);
				break;
			}
		}
	}

	return issues;
}

/** 1 つの用語集を検証し、見つかった問題をすべて返す */
export function validateGlossary(input: GlossaryInput): Issue[] {
	if (input.glossary === undefined) {
		return [{ file: "glossary.json", message: "ファイルがありません" }];
	}
	if (!isGlossary(input.glossary)) {
		return schemaIssues("glossary.json", isGlossary.errors);
	}
	const glossary = input.glossary;
	const issues: Issue[] = [];
	if (glossary.id !== input.directory) {
		issues.push({
			file: "glossary.json",
			message: `id は用語集のディレクトリ名 ${input.directory} と同じにしてください`,
		});
	}
	const criterionIds = glossary.criteria.map((criterion) => criterion.id);
	if (new Set(criterionIds).size !== criterionIds.length) {
		issues.push({
			file: "glossary.json",
			message: "基準の ID が重複しています",
		});
	}

	const terms: { file: string; fileName: string; term: Term }[] = [];
	for (const { fileName, data } of input.terms) {
		const file = `terms/${fileName}`;
		if (!fileName.endsWith(".json")) {
			issues.push({ file, message: "JSON 以外のファイルは置けません" });
		} else if (isTerm(data)) {
			terms.push({ file, fileName, term: data });
		} else {
			issues.push(...schemaIssues(file, isTerm.errors));
		}
	}

	const slugs = new Set(terms.map(({ term }) => slugify(term.heading)));
	for (const { file, fileName, term } of terms) {
		issues.push(...checkTerm(file, fileName, term, glossary, slugs));
	}
	return issues;
}
