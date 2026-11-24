import { beforeAll, describe, expect, test } from "vitest";
import { loadGlossaries } from "../../src/data/load.ts";
import {
	type GlossaryInput,
	isSafeHref,
	validateGlossary,
} from "../../src/data/validate.ts";

let example: GlossaryInput;

beforeAll(async () => {
	const [loaded] = await loadGlossaries("tests/fixtures/glossaries");
	if (!loaded) {
		throw new Error("検証用の用語集がありません");
	}
	example = loaded;
});

/** 検証用の用語集を複製し、一部を書き換えて検証する */
function validateModified(
	// biome-ignore lint/suspicious/noExplicitAny: 形式の誤ったデータを作るため、型による制約を外す
	modify: (glossary: any, terms: Record<string, any>) => void,
) {
	const input: GlossaryInput = structuredClone(example);
	const terms = Object.fromEntries(
		input.terms.map(({ fileName, data }) => [fileName, data]),
	);
	modify(input.glossary, terms);
	return validateGlossary(input).map((issue) => issue.message);
}

describe("validateGlossary", () => {
	test("正しい用語集では問題を報告しない", () => {
		expect(validateGlossary(example)).toEqual([]);
	});

	test("glossary.json がない", () => {
		expect(
			validateGlossary({ directory: "x", glossary: undefined, terms: [] }),
		).toEqual([{ file: "glossary.json", message: "ファイルがありません" }]);
	});

	test("形式が正しくない", () => {
		const messages = validateModified((_, terms) => {
			terms["subscriber.json"].definitions[0].source[0].type = "heading";
		});
		expect(messages.some((m) => m.startsWith("形式が正しくありません"))).toBe(
			true,
		);
	});

	test("id がディレクトリ名と異なる", () => {
		const messages = validateModified((glossary) => {
			glossary.id = "other";
		});
		expect(messages).toContain(
			"id は用語集のディレクトリ名 example と同じにしてください",
		);
	});

	test("基準の ID が重複している", () => {
		const messages = validateModified((glossary) => {
			glossary.criteria[1].id = "link";
		});
		expect(messages).toContain("基準の ID が重複しています");
	});

	test("ファイル名がスラッグと一致しない", () => {
		const messages = validateModified((_, terms) => {
			terms["subscriber.json"].heading = "Subscriber (SUB)";
		});
		expect(messages).toContain(
			"ファイル名は subscriber-sub.json にしてください",
		);
	});

	test("見出しからスラッグを作れない", () => {
		const messages = validateModified((_, terms) => {
			terms["subscriber.json"].heading = "加入者";
		});
		expect(messages).toContain('見出し "加入者" からスラッグを作れません');
	});

	test("原文を変えると、古い訳文として検出する", () => {
		const messages = validateModified((_, terms) => {
			terms["subscriber.json"].definitions[0].source[0].children[0].value +=
				" ";
		});
		expect(
			messages.some((m) =>
				m.startsWith("definitions[0] の訳文が現在の原文に対応していません"),
			),
		).toBe(true);
	});

	test("見出しを変えると、古い見出しの訳文として検出する", () => {
		const messages = validateModified((_, terms) => {
			terms["subscriber.json"].heading = "Subscriber";
		});
		expect(
			messages.some((m) =>
				m.startsWith("見出しの訳文が現在の見出しに対応していません"),
			),
		).toBe(true);
	});

	test("危険な URL のリンクを拒否する", () => {
		const messages = validateModified((_, terms) => {
			terms[
				"identity-service.json"
			].definitions[0].translation.content[0].children[0].href =
				"javascript:alert(1)";
		});
		expect(messages).toContain(
			"definitions[0] に使えない URL があります: javascript:alert(1)",
		);
	});

	test("参照元の定義がない", () => {
		const messages = validateModified((_, terms) => {
			terms["subscriber.json"].references[0].definition = 1;
		});
		expect(messages).toContain("references[0] の参照元の定義 1 がありません");
	});

	test("参照先の用語がない", () => {
		const messages = validateModified((_, terms) => {
			terms["subscriber.json"].references[0].target.term = "unknown";
		});
		expect(messages).toContain(
			"references[0] の参照先の用語 unknown がありません",
		);
	});

	test("ほかの用語集の用語を参照している", () => {
		const messages = validateModified((_, terms) => {
			terms["subscriber.json"].references[0].target.glossary = "other";
		});
		expect(messages).toContain(
			"references[0] の参照先は、同じ用語集の用語にしてください",
		);
	});

	test("基準が用語集にない", () => {
		const messages = validateModified((_, terms) => {
			terms["subscriber.json"].references[0].criterion = "unknown";
		});
		expect(messages).toContain(
			"references[0] の基準 unknown が用語集にありません",
		);
	});

	test("位置が原文の範囲外である", () => {
		const messages = validateModified((_, terms) => {
			terms["subscriber.json"].references[0].end = 1000;
		});
		expect(messages).toContain("references[0] の位置が原文の範囲外です");
	});

	test("位置にある原文が記録された表現と一致しない", () => {
		const messages = validateModified((_, terms) => {
			terms["subscriber.json"].references[0].start = 29;
			terms["subscriber.json"].references[0].end = 45;
		});
		expect(messages).toContain(
			'references[0] の位置にある原文は " identity servic" で、記録された表現 "identity service" と一致しません',
		);
	});

	test("参照の範囲が重なっている", () => {
		const messages = validateModified((_, terms) => {
			const references = terms["subscriber.json"].references;
			references.push({
				...references[0],
				start: 39,
				end: 46,
				text: "service",
			});
		});
		expect(messages).toContain("definitions[0] で参照の範囲が重なっています");
	});

	test("terms ディレクトリに JSON 以外のファイルがある", () => {
		const input = structuredClone(example);
		input.terms.push({ fileName: "notes.txt", data: undefined });
		expect(validateGlossary(input)).toContainEqual({
			file: "terms/notes.txt",
			message: "JSON 以外のファイルは置けません",
		});
	});
});

describe("isSafeHref", () => {
	test.each([
		["https://example.com/", true],
		["http://example.com/", true],
		["#subscriber", true],
		["../other/", true],
		["javascript:alert(1)", false],
		["data:text/html,x", false],
		["mailto:a@example.com", false],
	])("%s は %s", (href, expected) => {
		expect(isSafeHref(href)).toBe(expected);
	});
});
