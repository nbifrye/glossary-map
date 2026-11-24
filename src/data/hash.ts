import { createHash } from "node:crypto";
import type { Block } from "./types.ts";

/** オブジェクトのキーを UTF-16 のコード単位の順に並べ、空白を入れずに JSON に変換する */
export function canonicalJson(value: unknown): string {
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
