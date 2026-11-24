import { loadGlossaries } from "../src/data/load.ts";
import { validateGlossary } from "../src/data/validate.ts";

const root = process.argv[2] ?? "glossaries";
const glossaries = await loadGlossaries(root);
let count = 0;
for (const input of glossaries) {
	for (const issue of validateGlossary(input)) {
		console.error(`${root}/${input.directory}/${issue.file}: ${issue.message}`);
		count++;
	}
}
if (count > 0) {
	console.error(`${count} 件の問題が見つかりました`);
	process.exit(1);
}
console.log(`${glossaries.length} 件の用語集を検証しました`);
