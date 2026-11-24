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
	type Range,
	sliceCodePoints,
	textLayout,
} from "./text.ts";
import type { Glossary, Term } from "./types.ts";

export interface Issue {
	/** 用語集のディレクトリからの相対パス */
	file: string;
	message: string;
}

/** 読み込んだファイルの内容か、読み込めなかった理由 */
export type FileContent = { data: unknown } | { error: string };

export interface GlossaryInput {
	/** 用語集のディレクトリ名 */
	directory: string;
	glossary: FileContent;
	/** terms ディレクトリにあるファイル */
	terms: { fileName: string; content: FileContent }[];
}

const ajv = new Ajv2020({ allErrors: true, discriminator: true });
const isGlossary = ajv.compile<Glossary>(glossarySchema);
const isTerm = ajv.compile<Term>(termSchema);

const typeNames: Record<string, string> = {
	string: "文字列",
	integer: "整数",
	number: "数値",
	boolean: "真偽値",
	object: "オブジェクト",
	array: "配列",
	null: "null",
};

/** JSON Pointer を definitions[0].source のような表記にする */
function formatPath(pointer: string): string {
	return pointer
		.split("/")
		.slice(1)
		.map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
		.map((segment, index) =>
			/^\d+$/.test(segment)
				? `[${segment}]`
				: index === 0
					? segment
					: `.${segment}`,
		)
		.join("");
}

function schemaMessage(error: ErrorObject): string {
	const params = error.params as Record<string, unknown>;
	switch (error.keyword) {
		case "required":
			return `${params.missingProperty} がありません`;
		case "additionalProperties":
			return `${params.additionalProperty} は使えません`;
		case "type": {
			const name = typeNames[String(params.type)] ?? String(params.type);
			return `${name}${/^[A-Za-z]/.test(name) ? " " : ""}にしてください`;
		}
		case "const":
			return `${JSON.stringify(params.allowedValue)} にしてください`;
		case "pattern":
			return params.pattern === "\\S"
				? "空白以外の文字を含めてください"
				: `パターン ${params.pattern} に一致させてください`;
		case "minLength":
			return `${params.limit} 文字以上にしてください`;
		case "minItems":
			return `${params.limit} 件以上にしてください`;
		case "minimum":
			return `${params.limit} 以上にしてください`;
		case "minProperties":
			return `項目を ${params.limit} つ以上記録してください`;
		case "discriminator":
			return params.error === "mapping"
				? `${params.tag} の値 ${JSON.stringify(params.tagValue)} は使えません`
				: `${params.tag} を文字列で記録してください`;
		default:
			return error.message ?? error.keyword;
	}
}

function schemaIssues(
	file: string,
	errors: ErrorObject[] | null | undefined,
): Issue[] {
	return (errors ?? []).map((error) => {
		const path = formatPath(error.instancePath);
		return {
			file,
			message: `形式が正しくありません${path === "" ? "" : ` (${path})`}: ${schemaMessage(error)}`,
		};
	});
}

/** http:// または https:// で始まり、ホストを含む絶対 URL であるか */
export function isHttpUrl(value: string): boolean {
	if (!/^https?:\/\/[^/\\?#]/.test(value) || /[\s\p{Cc}]/u.test(value)) {
		return false;
	}
	try {
		const url = new URL(value);
		return (
			(url.protocol === "https:" || url.protocol === "http:") &&
			url.hostname !== ""
		);
	} catch {
		return false;
	}
}

/** YYYY・YYYY-MM・YYYY-MM-DD の形式の日付が、暦の上で存在するか */
export function isExistingDate(value: string): boolean {
	const [year, month, day] = value.split("-").map(Number);
	if (year === undefined || month === undefined || day === undefined) {
		return true;
	}
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function checkGlossary(directory: string, glossary: Glossary): Issue[] {
	const issues: Issue[] = [];
	const report = (message: string) =>
		issues.push({ file: "glossary.json", message });
	if (glossary.id !== directory) {
		report(`id は用語集のディレクトリ名 ${directory} と同じにしてください`);
	}
	for (const key of ["published", "retrieved"] as const) {
		if (!isExistingDate(glossary.source[key])) {
			report(`source.${key} の日付 ${glossary.source[key]} は存在しません`);
		}
	}
	if (!isHttpUrl(glossary.source.url)) {
		report(
			`source.url の ${glossary.source.url} は、ホストを含む http:// または https:// の絶対 URL にしてください`,
		);
	}
	const criterionIds = glossary.criteria.map((criterion) => criterion.id);
	if (new Set(criterionIds).size !== criterionIds.length) {
		report("基準の ID が重複しています");
	}
	return issues;
}

interface TermContext {
	/** 用語集の情報。glossary.json に誤りがある場合は undefined */
	glossary: Glossary | undefined;
	/** terms ディレクトリにある JSON ファイルのファイル名 */
	fileNames: Set<string>;
}

function checkSlug(
	fileName: string,
	term: Term,
	{ fileNames }: TermContext,
	report: (message: string) => void,
) {
	const generated = slugify(term.heading);
	const takenByOther = (slug: string) =>
		slug !== "" && `${slug}.json` !== fileName && fileNames.has(`${slug}.json`);
	if (term.slug !== undefined && generated !== "" && !takenByOther(generated)) {
		report(
			`見出しから作ったスラッグ ${generated} を使えるため、slug は記録しないでください`,
		);
		return;
	}
	const slug = term.slug ?? generated;
	if (slug === "") {
		report(
			`見出し "${term.heading}" からスラッグを作れません。slug にスラッグを記録してください`,
		);
	} else if (takenByOther(slug)) {
		report(
			term.slug === undefined
				? `見出しから作ったスラッグ ${slug} が terms/${slug}.json の用語と重複しています。slug に別のスラッグを記録してください`
				: `slug の ${slug} が terms/${slug}.json の用語と重複しています`,
		);
	} else if (fileName !== `${slug}.json`) {
		report(`ファイル名は ${slug}.json にしてください`);
	}
}

/** 参照の範囲が原文のリンクと一部だけ重なっているか */
function overlapsLinkPartially(range: Range, links: Range[]): boolean {
	return links.some(
		(link) =>
			range.start < link.end &&
			link.start < range.end &&
			!(range.start === link.start && range.end === link.end),
	);
}

function checkTerm(
	file: string,
	fileName: string,
	term: Term,
	context: TermContext,
): Issue[] {
	const issues: Issue[] = [];
	const report = (message: string) => issues.push({ file, message });

	checkSlug(fileName, term, context, report);

	const expectedHeadingHash = headingHash(term.heading);
	if (term.headingTranslation.sourceHash !== expectedHeadingHash) {
		report(
			`見出しの訳文が現在の見出しに対応していません。見出しのハッシュ値は ${expectedHeadingHash} です`,
		);
	}

	const layouts = term.definitions.map((definition) =>
		textLayout(definition.source),
	);
	term.definitions.forEach((definition, index) => {
		const label = `definitions[${index}]`;
		const expectedHash = definitionHash(definition.source);
		if (definition.translation.sourceHash !== expectedHash) {
			report(
				`${label} の訳文が現在の原文に対応していません。原文のハッシュ値は ${expectedHash} です`,
			);
		}
		if (layouts[index]?.text.trim() === "") {
			report(`${label} の原文に、空白以外の文字がありません`);
		}
		if (textLayout(definition.translation.content).text.trim() === "") {
			report(`${label} の訳文に、空白以外の文字がありません`);
		}
		const urls = [
			...(definition.location.url === undefined
				? []
				: [definition.location.url]),
			...linkHrefs(definition.source),
			...linkHrefs(definition.translation.content),
		];
		for (const url of urls) {
			if (!isHttpUrl(url)) {
				report(
					`${label} の URL ${url} は、ホストを含む http:// または https:// の絶対 URL にしてください`,
				);
			}
		}
	});

	const { glossary, fileNames } = context;
	const criteria = new Set(
		glossary?.criteria.map((criterion) => criterion.id) ?? [],
	);
	const ranges = new Map<number, Range[]>();
	term.references.forEach((reference, index) => {
		const label = `references[${index}]`;
		if (glossary !== undefined) {
			if (reference.target.glossary !== glossary.id) {
				report(`${label} の参照先は、同じ用語集の用語にしてください`);
			} else if (!fileNames.has(`${reference.target.term}.json`)) {
				report(`${label} の参照先の用語 ${reference.target.term} がありません`);
			}
			if (!criteria.has(reference.criterion)) {
				report(`${label} の基準 ${reference.criterion} が用語集にありません`);
			}
		}
		const layout = layouts[reference.definition];
		if (layout === undefined) {
			report(`${label} の参照元の定義 ${reference.definition} がありません`);
			return;
		}
		if (reference.start >= reference.end) {
			report(`${label} の start は end より小さくしてください`);
			return;
		}
		if (reference.end > codePointLength(layout.text)) {
			report(`${label} の位置が原文の範囲外です`);
			return;
		}
		const actual = sliceCodePoints(layout.text, reference.start, reference.end);
		if (actual !== reference.text) {
			report(
				`${label} の位置にある原文は "${actual}" で、記録された表現 "${reference.text}" と一致しません`,
			);
			return;
		}
		const range = { start: reference.start, end: reference.end };
		if (
			!layout.paragraphs.some(
				(paragraph) =>
					paragraph.start <= range.start && range.end <= paragraph.end,
			)
		) {
			report(`${label} の範囲が、1 つの段落に収まっていません`);
		}
		if (overlapsLinkPartially(range, layout.links)) {
			report(
				`${label} の範囲が、原文のリンクと一部だけ重なっています。リンク全体と一致させるか、リンクと重ならないようにしてください`,
			);
		}
		const list = ranges.get(reference.definition) ?? [];
		list.push(range);
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
	const issues: Issue[] = [];

	let glossary: Glossary | undefined;
	if ("error" in input.glossary) {
		issues.push({ file: "glossary.json", message: input.glossary.error });
	} else if (isGlossary(input.glossary.data)) {
		glossary = input.glossary.data;
		issues.push(...checkGlossary(input.directory, glossary));
	} else {
		issues.push(...schemaIssues("glossary.json", isGlossary.errors));
	}

	if (input.terms.length === 0) {
		issues.push({ file: "terms/", message: "用語のファイルがありません" });
	}
	const terms: { file: string; fileName: string; term: Term }[] = [];
	for (const { fileName, content } of input.terms) {
		const file = `terms/${fileName}`;
		if ("error" in content) {
			issues.push({ file, message: content.error });
		} else if (isTerm(content.data)) {
			terms.push({ file, fileName, term: content.data });
		} else {
			issues.push(...schemaIssues(file, isTerm.errors));
		}
	}

	const context: TermContext = {
		glossary,
		fileNames: new Set(
			input.terms
				.map(({ fileName }) => fileName)
				.filter((fileName) => fileName.endsWith(".json")),
		),
	};
	for (const { file, fileName, term } of terms) {
		issues.push(...checkTerm(file, fileName, term, context));
	}
	return issues;
}
