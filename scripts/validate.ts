import { loadGlossaries } from "../src/data/load.ts";
import { type GlossaryInput, validateGlossary } from "../src/data/validate.ts";

const argument = process.argv[2];
const root = argument ?? "glossaries";

let glossaries: GlossaryInput[];
try {
	glossaries = await loadGlossaries(root);
} catch (error) {
	// 引数がない場合は、glossaries ディレクトリがまだなくてもよい
	if (
		argument === undefined &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	) {
		glossaries = [];
	} else {
		console.error(
			`${root} を読み込めません: ${error instanceof Error ? error.message : error}`,
		);
		process.exit(1);
	}
}

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
