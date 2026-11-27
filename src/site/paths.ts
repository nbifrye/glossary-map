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
