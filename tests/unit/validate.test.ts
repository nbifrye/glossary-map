import { beforeAll, describe, expect, test } from "vitest";
import { definitionHash, headingHash } from "../../src/data/hash.ts";
import { loadGlossaries } from "../../src/data/load.ts";
import {
	type GlossaryInput,
	isExistingDate,
	isHttpUrl,
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

// biome-ignore lint/suspicious/noExplicitAny: 形式の誤ったデータを作るため、型による制約を外す
type Json = any;

/** 見出しと原文のハッシュ値を、現在の見出しと原文に合わせる */
function rehash(term: Json) {
	term.headingTranslation.sourceHash = headingHash(term.heading);
	for (const definition of term.definitions ?? []) {
		definition.translation.sourceHash = definitionHash(definition.source);
	}
}

/**
 * 検証用の用語集を複製し、一部を書き換えて検証する。
 * terms には、ファイル名をキーとして用語を追加できる
 */
function validateModified(
	modify: (glossary: Json, terms: Record<string, Json>) => void,
	{ updateHashes = true } = {},
) {
	const input: GlossaryInput = structuredClone(example);
	const glossary = "data" in input.glossary ? input.glossary.data : undefined;
	const terms: Record<string, Json> = Object.fromEntries(
		input.terms.map(({ fileName, content }) => [
			fileName,
			"data" in content ? content.data : undefined,
		]),
	);
	modify(glossary, terms);
	if (updateHashes) {
		Object.values(terms).forEach(rehash);
	}
	input.terms = Object.entries(terms)
		.toSorted(([a], [b]) => (a < b ? -1 : 1))
		.map(([fileName, data]) => ({ fileName, content: { data } }));
	return validateGlossary(input).map((issue) => issue.message);
}

const paragraph = (value: string) => ({
	type: "paragraph",
	children: [{ type: "text", value }],
});

describe("validateGlossary", () => {
	test("正しい用語集では問題を報告しない", () => {
		expect(validateGlossary(example)).toEqual([]);
	});

	describe("ファイル", () => {
		test("読み込めなかったファイルを報告する", () => {
			const input = structuredClone(example);
			input.glossary = { error: "ファイルがありません" };
			input.terms.push({
				fileName: "notes.txt",
				content: { error: "JSON 以外のファイルは置けません" },
			});
			const issues = validateGlossary(input);
			expect(issues).toContainEqual({
				file: "glossary.json",
				message: "ファイルがありません",
			});
			expect(issues).toContainEqual({
				file: "terms/notes.txt",
				message: "JSON 以外のファイルは置けません",
			});
		});

		test("用語のファイルがない", () => {
			const input = structuredClone(example);
			input.terms = [];
			expect(validateGlossary(input)).toEqual([
				{ file: "terms/", message: "用語のファイルがありません" },
			]);
		});
	});

	describe("形式", () => {
		test("type の誤りは、1 件の問題として報告する", () => {
			const messages = validateModified((_, terms) => {
				terms["subscriber.json"].definitions[0].source[0].type = "heading";
			});
			expect(messages).toEqual([
				'形式が正しくありません (definitions[0].source[0]): type の値 "heading" は使えません',
			]);
		});

		test("選ばれたブロックの中の誤りだけを報告する", () => {
			const messages = validateModified((_, terms) => {
				terms["subscriber.json"].definitions[0].source[0].ordered = true;
			});
			expect(messages).toEqual([
				"形式が正しくありません (definitions[0].source[0]): ordered は使えません",
			]);
		});

		test("必須の項目がない", () => {
			const messages = validateModified((_, terms) => {
				delete terms["subscriber.json"].definitions;
			});
			expect(messages).toEqual([
				"形式が正しくありません: definitions がありません",
			]);
		});

		test("空白だけの文字列を拒否する", () => {
			const messages = validateModified((glossary, terms) => {
				glossary.title = " ";
				terms["subscriber.json"].headingTranslation.text = "　";
				terms["identity-service.json"].definitions[0].location.label = "\n";
			});
			expect(messages).toEqual([
				"形式が正しくありません (title): 空白以外の文字を含めてください",
				"形式が正しくありません (definitions[0].location.label): 空白以外の文字を含めてください",
				"形式が正しくありません (headingTranslation.text): 空白以外の文字を含めてください",
			]);
		});

		test("原典の該当箇所が空である", () => {
			const messages = validateModified((_, terms) => {
				terms["subscriber.json"].definitions[0].location = {};
			});
			expect(messages).toEqual([
				"形式が正しくありません (definitions[0].location): 項目を 1 つ以上記録してください",
			]);
		});

		test("リンクの中にリンクを置けない", () => {
			const messages = validateModified((_, terms) => {
				const link =
					terms["identity-service.json"].definitions[0].source[0].children[1];
				link.children[0].children.push({ ...structuredClone(link) });
			});
			expect(messages).toEqual([
				'形式が正しくありません (definitions[0].source[0].children[1].children[0].children[1]): type の値 "link" は使えません',
			]);
		});

		test("参照先と基準の ID の形式を検証する", () => {
			const messages = validateModified((_, terms) => {
				terms["subscriber.json"].references[0].target.term = "Identity Service";
			});
			expect(messages).toEqual([
				"形式が正しくありません (references[0].target.term): パターン ^[a-z0-9]+(-[a-z0-9]+)*$ に一致させてください",
			]);
		});

		test("glossary.json に誤りがあっても、用語のファイルを検証する", () => {
			const messages = validateModified((glossary, terms) => {
				delete glossary.criteria;
				terms["subscriber.json"].heading = "Subscriber (SUB)";
			});
			expect(messages).toEqual([
				"形式が正しくありません: criteria がありません",
				"ファイル名は subscriber-sub.json にしてください",
			]);
		});

		test("形式に誤りのある用語も、参照先として扱う", () => {
			const messages = validateModified((_, terms) => {
				delete terms["subscriber.json"].definitions;
			});
			expect(messages).not.toContain(
				"references[0] の参照先の用語 subscriber がありません",
			);
		});
	});

	describe("用語集", () => {
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

		test("存在しない日付を拒否する", () => {
			const messages = validateModified((glossary) => {
				glossary.source.published = "2025-02-29";
				glossary.source.retrieved = "2026-02-30";
			});
			expect(messages).toEqual([
				"source.published の日付 2025-02-29 は存在しません",
				"source.retrieved の日付 2026-02-30 は存在しません",
			]);
		});

		test("原典の URL にホストがない", () => {
			const messages = validateModified((glossary) => {
				glossary.source.url = "https://";
			});
			expect(messages).toEqual([
				"source.url の https:// は、ホストを含む http:// または https:// の絶対 URL にしてください",
			]);
		});
	});

	describe("スラッグ", () => {
		test("ファイル名がスラッグと一致しない", () => {
			const messages = validateModified((_, terms) => {
				terms["subscriber.json"].heading = "Subscriber (SUB)";
			});
			expect(messages).toEqual([
				"ファイル名は subscriber-sub.json にしてください",
			]);
		});

		test("見出しからスラッグを作れない", () => {
			const messages = validateModified((_, terms) => {
				terms["subscriber.json"].heading = "加入者";
			});
			expect(messages).toEqual([
				'見出し "加入者" からスラッグを作れません。slug にスラッグを記録してください',
			]);
		});

		test("見出しからスラッグを作れない場合は、slug に記録できる", () => {
			const messages = validateModified((_, terms) => {
				terms["subscriber.json"].heading = "加入者";
				terms["subscriber.json"].slug = "subscriber";
			});
			expect(messages).toEqual([]);
		});

		test("スラッグが重複している", () => {
			const messages = validateModified((_, terms) => {
				terms["subscriber-2.json"] = structuredClone(terms["subscriber.json"]);
				terms["subscriber-2.json"].heading = "Subscriber";
			});
			expect(messages).toEqual([
				"見出しから作ったスラッグ subscriber が terms/subscriber.json の用語と重複しています。slug に別のスラッグを記録してください",
			]);
		});

		test("スラッグが重複する場合は、slug に別のスラッグを記録できる", () => {
			const messages = validateModified((_, terms) => {
				terms["subscriber-2.json"] = structuredClone(terms["subscriber.json"]);
				terms["subscriber-2.json"].heading = "Subscriber";
				terms["subscriber-2.json"].slug = "subscriber-2";
			});
			expect(messages).toEqual([]);
		});

		test("slug に記録したスラッグも重複を検証する", () => {
			const messages = validateModified((_, terms) => {
				terms["subscriber-2.json"] = structuredClone(terms["subscriber.json"]);
				terms["subscriber-2.json"].heading = "Subscriber";
				terms["subscriber-2.json"].slug = "identity-service";
			});
			expect(messages).toEqual([
				"slug の identity-service が terms/identity-service.json の用語と重複しています",
			]);
		});

		test("見出しから作ったスラッグを使える場合は、slug を記録できない", () => {
			const messages = validateModified((_, terms) => {
				terms["subscriber.json"].slug = "subscriber";
			});
			expect(messages).toEqual([
				"見出しから作ったスラッグ subscriber を使えるため、slug は記録しないでください",
			]);
		});
	});

	describe("訳文", () => {
		test("原文を変えると、古い訳文として検出する", () => {
			const messages = validateModified(
				(_, terms) => {
					terms["subscriber.json"].definitions[0].source[0].children[0].value +=
						" ";
				},
				{ updateHashes: false },
			);
			expect(messages).toEqual([
				`definitions[0] の訳文が現在の原文に対応していません。原文のハッシュ値は ${definitionHash([paragraph("An individual enrolled in the identity service. ")] as Json)} です`,
			]);
		});

		test("見出しを変えると、古い見出しの訳文として検出する", () => {
			const messages = validateModified(
				(_, terms) => {
					terms["subscriber.json"].heading = "Subscriber";
				},
				{ updateHashes: false },
			);
			expect(messages).toEqual([
				`見出しの訳文が現在の見出しに対応していません。見出しのハッシュ値は ${headingHash("Subscriber")} です`,
			]);
		});

		test("空白だけの原文と訳文を拒否する", () => {
			const messages = validateModified((_, terms) => {
				const [definition] = terms["subscriber.json"].definitions;
				definition.source = [paragraph(" ")];
				definition.translation.content = [paragraph("　")];
				terms["subscriber.json"].references = [];
			});
			expect(messages).toEqual([
				"definitions[0] の原文に、空白以外の文字がありません",
				"definitions[0] の訳文に、空白以外の文字がありません",
			]);
		});
	});

	describe("URL", () => {
		test("リンクの URL は http・https の絶対 URL に限る", () => {
			const messages = validateModified((_, terms) => {
				terms[
					"identity-service.json"
				].definitions[0].translation.content[0].children[0].href =
					"#subscriber";
			});
			expect(messages).toEqual([
				"形式が正しくありません (definitions[0].translation.content[0].children[0].href): パターン ^https?:// に一致させてください",
			]);
		});

		test("リストや強調の中のリンクと、原典の該当箇所の URL を検証する", () => {
			const messages = validateModified((_, terms) => {
				const [definition] = terms["subscriber.json"].definitions;
				definition.location.url = "https://invalid host/";
				definition.translation.content.push({
					type: "list",
					ordered: false,
					items: [
						[
							{
								type: "paragraph",
								children: [
									{
										type: "emphasis",
										children: [
											{
												type: "link",
												href: "https:///evil.example",
												children: [{ type: "text", value: "x" }],
											},
										],
									},
								],
							},
						],
					],
				});
			});
			expect(messages).toEqual([
				"definitions[0] の URL https://invalid host/ は、ホストを含む http:// または https:// の絶対 URL にしてください",
				"definitions[0] の URL https:///evil.example は、ホストを含む http:// または https:// の絶対 URL にしてください",
			]);
		});
	});

	describe("参照", () => {
		test("参照元の定義がない場合も、参照先と基準を検証する", () => {
			const messages = validateModified((_, terms) => {
				const [reference] = terms["subscriber.json"].references;
				reference.definition = 1;
				reference.target.term = "unknown";
				reference.criterion = "unknown";
			});
			expect(messages).toEqual([
				"references[0] の参照先の用語 unknown がありません",
				"references[0] の基準 unknown が用語集にありません",
				"references[0] の参照元の定義 1 がありません",
			]);
		});

		test("ほかの用語集の用語を参照している", () => {
			const messages = validateModified((_, terms) => {
				terms["subscriber.json"].references[0].target.glossary = "other";
			});
			expect(messages).toEqual([
				"references[0] の参照先は、同じ用語集の用語にしてください",
			]);
		});

		test("start が end 以上である", () => {
			const messages = validateModified((_, terms) => {
				terms["subscriber.json"].references[0].start = 46;
			});
			expect(messages).toEqual([
				"references[0] の start は end より小さくしてください",
			]);
		});

		test("位置が原文の範囲外である", () => {
			const messages = validateModified((_, terms) => {
				terms["subscriber.json"].references[0].end = 1000;
			});
			expect(messages).toEqual(["references[0] の位置が原文の範囲外です"]);
		});

		test("位置にある原文が記録された表現と一致しない", () => {
			const messages = validateModified((_, terms) => {
				terms["subscriber.json"].references[0].start = 29;
				terms["subscriber.json"].references[0].end = 45;
			});
			expect(messages).toEqual([
				'references[0] の位置にある原文は " identity servic" で、記録された表現 "identity service" と一致しません',
			]);
		});

		test("位置をコードポイント単位で数える", () => {
			const messages = validateModified((_, terms) => {
				const [definition] = terms["subscriber.json"].definitions;
				definition.source[0].children[0].value =
					"😀 An individual enrolled in the identity service.";
				terms["subscriber.json"].references[0].start = 32;
				terms["subscriber.json"].references[0].end = 48;
			});
			expect(messages).toEqual([]);
		});

		test("リストの中の段落を参照できる", () => {
			const messages = validateModified((_, terms) => {
				const [definition] = terms["subscriber.json"].definitions;
				definition.source = [
					{
						type: "list",
						ordered: true,
						items: [
							[paragraph("An individual.")],
							[paragraph("Enrolled in the identity service.")],
						],
					},
				];
				Object.assign(terms["subscriber.json"].references[0], {
					start: 30,
					end: 46,
				});
			});
			expect(messages).toEqual([]);
		});

		test("段落をまたぐ範囲を拒否する", () => {
			const messages = validateModified((_, terms) => {
				const [definition] = terms["subscriber.json"].definitions;
				definition.source = [
					paragraph("An individual enrolled in the identity"),
					paragraph(" service."),
				];
			});
			expect(messages).toEqual([
				"references[0] の範囲が、1 つの段落に収まっていません",
			]);
		});

		test("原文のリンクと一部だけ重なる範囲を拒否する", () => {
			const messages = validateModified((_, terms) => {
				Object.assign(terms["identity-service.json"].references[0], {
					start: 18,
					text: "a subscriber",
				});
			});
			expect(messages).toEqual([
				"references[0] の範囲が、原文のリンクと一部だけ重なっています。リンク全体と一致させるか、リンクと重ならないようにしてください",
			]);
		});

		test("参照の範囲が重なっている", () => {
			const messages = validateModified((_, terms) => {
				const references = terms["subscriber.json"].references;
				references.push({
					...references[0],
					start: 26,
					end: 34,
					text: "the iden",
				});
			});
			expect(messages).toEqual(["definitions[0] で参照の範囲が重なっています"]);
		});

		test("接している範囲は重なりとみなさない", () => {
			const messages = validateModified((_, terms) => {
				const references = terms["subscriber.json"].references;
				references.push(
					{ ...references[0], start: 30, end: 38, text: "identity" },
					{ ...references[0], start: 38, end: 46, text: " service" },
				);
				references.shift();
			});
			expect(messages).toEqual([]);
		});
	});
});

describe("isHttpUrl", () => {
	test.each([
		["https://example.com/", true],
		["http://example.com/", true],
		["https://example.com/a?b=c#d", true],
		["https://example.com/用語", true],
		["#subscriber", false],
		["../other/", false],
		["//evil.example/phish", false],
		["/\\evil.example", false],
		["https:foo", false],
		["http:foo", false],
		["https://", false],
		["https:///evil.example", false],
		["https://\\evil.example", false],
		["https://invalid host/path", false],
		[" https://example.com/", false],
		["https://example.com/\n", false],
		["   ", false],
		["HTTPS://example.com/", false],
		["javascript:alert(1)", false],
		["mailto:a@example.com", false],
	])("%j は %s", (url, expected) => {
		expect(isHttpUrl(url)).toBe(expected);
	});
});

describe("isExistingDate", () => {
	test.each([
		["2026", true],
		["2026-02", true],
		["2024-02-29", true],
		["2025-02-29", false],
		["2026-02-30", false],
		["2026-04-31", false],
	])("%s は %s", (date, expected) => {
		expect(isExistingDate(date)).toBe(expected);
	});
});
