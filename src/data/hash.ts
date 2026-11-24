import { createHash } from "node:crypto";
import type { Block } from "./types.ts";

export type JsonValue =
	| null
	| boolean
	| number
	| string
	| readonly JsonValue[]
	| { readonly [key: string]: JsonValue };

/**
 * RFC 8785 (JSON Canonicalization Scheme) に従って JSON に変換する。
 * オブジェクトのキーを UTF-16 のコード単位の順に並べ、空白を入れず、
 * 文字列は JSON.stringify と同じ規則でエスケープする
 */
export function canonicalJson(value: JsonValue): string {
	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(",")}]`;
	}
	if (value !== null && typeof value === "object") {
		const entries = Object.entries(value)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
		return `{${entries.join(",")}}`;
	}
	return JSON.stringify(value);
}

function sha256(text: string): string {
	return createHash("sha256").update(text, "utf8").digest("hex");
}

export function headingHash(heading: string): string {
	return sha256(heading);
}

export function definitionHash(source: Block[]): string {
	return sha256(canonicalJson(source));
}
