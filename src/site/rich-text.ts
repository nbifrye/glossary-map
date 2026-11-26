import type { Block, Inline, LinkContent } from "../data/types.ts";

/** 描画用のインライン。原文の構造に、参照先へのリンク (reference) を加えたもの */
export type RichInline =
	| { type: "text"; value: string }
	| { type: "emphasis"; children: RichInline[] }
	| { type: "link"; href: string; children: RichInline[] }
	| { type: "reference"; href: string; children: RichInline[] };

export type RichBlock =
	| { type: "paragraph"; children: RichInline[] }
	| { type: "list"; ordered: boolean; items: RichBlock[][] };

/** 原文中の参照の範囲と、参照先の URL */
export interface ReferenceSpan {
	start: number;
	end: number;
	href: string;
}

type Wrapper = Exclude<Inline | LinkContent, { type: "text" }>;

interface Piece {
	text: string;
	wrappers: Wrapper[];
}

/** 文字列の断片を、囲んでいる強調やリンクを共有しながら木構造に組み立て直す */
function build(pieces: Piece[]): RichInline[] {
	const root: RichInline[] = [];
	const stack: { wrapper: Wrapper; children: RichInline[] }[] = [];
	for (const piece of pieces) {
		let common = 0;
		while (
			common < stack.length &&
			stack[common]?.wrapper === piece.wrappers[common]
		) {
			common++;
		}
		stack.length = common;
		for (const wrapper of piece.wrappers.slice(common)) {
			const children: RichInline[] = [];
			const node: RichInline =
				wrapper.type === "link"
					? { type: "link", href: wrapper.href, children }
					: { type: "emphasis", children };
			(stack.at(-1)?.children ?? root).push(node);
			stack.push({ wrapper, children });
		}
		const target = stack.at(-1)?.children ?? root;
		const last = target.at(-1);
		if (last?.type === "text") {
			last.value += piece.text;
		} else {
			target.push({ type: "text", value: piece.text });
		}
	}
	return root;
}

/**
 * 原文の木構造に参照を重ね、各参照の範囲を参照先へのリンクにする。
 * 参照の範囲と一致する原文のリンクは、参照先へのリンクに置き換える。
 * 参照の範囲は、検証済み (1 つの段落に収まり、互いに重ならず、原文のリンクと一部だけ重ならない) であるものとする
 */
export function applyReferences(
	blocks: Block[],
	references: ReferenceSpan[],
): RichBlock[] {
	let offset = 0;
	const referenceAt = (position: number) =>
		references.find(
			(reference) => reference.start <= position && position < reference.end,
		);

	const paragraph = (children: Inline[]): RichInline[] => {
		// 段落を、参照の境界で区切った文字列の断片に分ける
		const groups: { reference: ReferenceSpan | undefined; pieces: Piece[] }[] =
			[];
		const visit = (node: Inline | LinkContent, wrappers: Wrapper[]) => {
			if (node.type !== "text") {
				for (const child of node.children) {
					visit(child, [...wrappers, node]);
				}
				return;
			}
			for (const character of Array.from(node.value)) {
				const reference = referenceAt(offset);
				const group = groups.at(-1);
				if (group === undefined || group.reference !== reference) {
					groups.push({ reference, pieces: [{ text: character, wrappers }] });
				} else {
					const lastPiece = group.pieces.at(-1);
					if (lastPiece?.wrappers === wrappers) {
						lastPiece.text += character;
					} else {
						group.pieces.push({ text: character, wrappers });
					}
				}
				offset++;
			}
		};
		for (const child of children) {
			visit(child, []);
		}
		return groups.flatMap(({ reference, pieces }): RichInline[] => {
			if (reference === undefined) {
				return build(pieces);
			}
			const inner = pieces.map((piece) => ({
				text: piece.text,
				wrappers: piece.wrappers.filter((wrapper) => wrapper.type !== "link"),
			}));
			return [
				{ type: "reference", href: reference.href, children: build(inner) },
			];
		});
	};

	const block = (item: Block): RichBlock =>
		item.type === "paragraph"
			? { type: "paragraph", children: paragraph(item.children) }
			: {
					type: "list",
					ordered: item.ordered,
					items: item.items.map((blocks) => blocks.map(block)),
				};

	return blocks.map(block);
}
