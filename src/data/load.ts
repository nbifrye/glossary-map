import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GlossaryInput } from "./validate.ts";

function isNotFound(error: unknown): boolean {
	return (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** JSON を読み込む。ファイルがなければ undefined を返す */
async function readJson(path: string): Promise<unknown> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if (isNotFound(error)) {
			return undefined;
		}
		throw error;
	}
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new Error(`${path} を JSON として読めません`, { cause: error });
	}
}

async function readDirectory(path: string) {
	try {
		return await readdir(path, { withFileTypes: true });
	} catch (error) {
		if (isNotFound(error)) {
			return [];
		}
		throw error;
	}
}

/** glossaries ディレクトリから、用語集ごとにファイルを読み込む */
export async function loadGlossaries(root: string): Promise<GlossaryInput[]> {
	const directories = (await readDirectory(root))
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.toSorted();
	return Promise.all(
		directories.map(async (directory) => {
			const termsDirectory = join(root, directory, "terms");
			const fileNames = (await readDirectory(termsDirectory))
				.map((entry) => entry.name)
				.toSorted();
			return {
				directory,
				glossary: await readJson(join(root, directory, "glossary.json")),
				terms: await Promise.all(
					fileNames.map(async (fileName) => ({
						fileName,
						data: fileName.endsWith(".json")
							? await readJson(join(termsDirectory, fileName))
							: undefined,
					})),
				),
			};
		}),
	);
}
