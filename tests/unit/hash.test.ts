import { describe, expect, test } from "vitest";
import {
	canonicalJson,
	definitionHash,
	headingHash,
} from "../../src/data/hash.ts";

describe("canonicalJson", () => {
	test("キーを並べ替え、空白を入れない", () => {
		expect(canonicalJson({ b: [1, { d: true, c: null }], a: "x" })).toBe(
			'{"a":"x","b":[1,{"c":null,"d":true}]}',
		);
	});

	test("キーをコードポイントではなく UTF-16 のコード単位の順に並べる", () => {
		expect(canonicalJson({ "\uE000": 1, "😀": 2 })).toBe('{"😀":2,"\uE000":1}');
	});

	test("ASCII 以外の文字はエスケープせず、制御文字はエスケープする", () => {
		expect(canonicalJson('’—😀\n\u0001"\\')).toBe('"’—😀\\n\\u0001\\"\\\\"');
	});
});

describe("ハッシュ値", () => {
	test("見出しのハッシュ値は文字列の SHA-256 である", () => {
		expect(headingHash("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});

	test("定義のハッシュ値はキーの順序によらない", () => {
		expect(
			definitionHash([
				{ type: "paragraph", children: [{ type: "text", value: "x" }] },
			]),
		).toBe(
			definitionHash([
				{ children: [{ value: "x", type: "text" }], type: "paragraph" },
			]),
		);
	});
});
