/** 検索の入力と、見出しやその訳文を比較できるように、NFKC で正規化して小文字にする */
export function normalize(text: string): string {
	return text.normalize("NFKC").toLowerCase();
}

/** 用語の検索に使うキーワード。見出しと見出しの訳文を正規化してつなげる */
export function keywords(heading: string, translation: string): string {
	return normalize(`${heading}\n${translation}`);
}
