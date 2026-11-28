const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export function homePath(): string {
	return `${base}/`;
}

export function glossaryPath(glossary: string): string {
	return `${base}/${glossary}/`;
}

export function termPath(glossary: string, slug: string): string {
	return `${base}/${glossary}/terms/${slug}/`;
}

/** 用語のページのパスの共通部分。末尾にスラッグと / を付けると、用語のページのパスになる */
export function termsBasePath(glossary: string): string {
	return `${base}/${glossary}/terms/`;
}
