/** 見出しから用語のスラッグを作る。規則は docs/data-format.md を参照 */
export function slugify(heading: string): string {
	return heading
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}
