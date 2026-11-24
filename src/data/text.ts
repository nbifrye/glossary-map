import type { Block, Inline } from "./types.ts";

function inlineText(inline: Inline): string {
	if (inline.type === "text") {
		return inline.value;
	}
	return inline.children.map(inlineText).join("");
}

function blockText(block: Block): string {
	if (block.type === "paragraph") {
		return block.children.map(inlineText).join("");
	}
	return block.items.map((item) => item.map(blockText).join("")).join("");
}

/** 木構造から構造を除いた文字列。参照の位置はこの文字列のコードポイント単位で数える */
export function plainText(blocks: Block[]): string {
	return blocks.map(blockText).join("");
}

/** コードポイント単位で文字列の一部を取り出す */
export function sliceCodePoints(text: string, start: number, end: number) {
	return Array.from(text).slice(start, end).join("");
}

export function codePointLength(text: string): number {
	return Array.from(text).length;
}

/** 木構造に含まれるすべてのリンクの URL */
export function linkHrefs(blocks: Block[]): string[] {
	const hrefs: string[] = [];
	const visitInline = (inline: Inline) => {
		if (inline.type === "link") {
			hrefs.push(inline.href);
		}
		if (inline.type !== "text") {
			inline.children.forEach(visitInline);
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
