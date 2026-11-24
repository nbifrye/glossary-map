import type { Block, Inline, LinkContent } from "./types.ts";

/** コードポイント単位の範囲。end の位置の文字は含めない */
export interface Range {
	start: number;
	end: number;
}

export interface TextLayout {
	/** 木構造から構造を除いた文字列。区切り文字は入れない */
	text: string;
	/** 各段落の範囲 */
	paragraphs: Range[];
	/** 各リンクの範囲 */
	links: Range[];
}

export function codePointLength(text: string): number {
	return Array.from(text).length;
}

/** 木構造から構造を除いた文字列と、段落とリンクの範囲を求める */
export function textLayout(blocks: Block[]): TextLayout {
	let text = "";
	let length = 0;
	const paragraphs: Range[] = [];
	const links: Range[] = [];
	const visitInline = (inline: Inline | LinkContent) => {
		if (inline.type === "text") {
			text += inline.value;
			length += codePointLength(inline.value);
			return;
		}
		const start = length;
		for (const child of inline.children) {
			visitInline(child);
		}
		if (inline.type === "link") {
			links.push({ start, end: length });
		}
	};
	const visitBlock = (block: Block) => {
		if (block.type === "paragraph") {
			const start = length;
			block.children.forEach(visitInline);
			paragraphs.push({ start, end: length });
		} else {
			for (const item of block.items) {
				item.forEach(visitBlock);
			}
		}
	};
	blocks.forEach(visitBlock);
	return { text, paragraphs, links };
}

/** 木構造から構造を除いた文字列。参照の位置はこの文字列のコードポイント単位で数える */
export function plainText(blocks: Block[]): string {
	return textLayout(blocks).text;
}

/** コードポイント単位で文字列の一部を取り出す */
export function sliceCodePoints(text: string, start: number, end: number) {
	return Array.from(text).slice(start, end).join("");
}

/** 木構造に含まれるすべてのリンクの URL */
export function linkHrefs(blocks: Block[]): string[] {
	const hrefs: string[] = [];
	const visitInline = (inline: Inline | LinkContent) => {
		if (inline.type === "text") {
			return;
		}
		if (inline.type === "link") {
			hrefs.push(inline.href);
		}
		for (const child of inline.children) {
			visitInline(child);
		}
	};
	const visitBlock = (block: Block) => {
		if (block.type === "paragraph") {
			block.children.forEach(visitInline);
		} else {
			for (const item of block.items) {
				item.forEach(visitBlock);
			}
		}
	};
	blocks.forEach(visitBlock);
	return hrefs;
}
