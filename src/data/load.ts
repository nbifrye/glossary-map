import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileContent, GlossaryInput } from "./validate.ts";

function errorCode(error: unknown): string | undefined {
	return (error as NodeJS.ErrnoException).code;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** JSON を読み込む。読み込めない場合は、理由を返す */
async function readJson(path: string): Promise<FileContent> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		switch (errorCode(error)) {
			case "ENOENT":
				return { error: "ファイルがありません" };
			case "EISDIR":
				return { error: "ファイルではありません" };
			default:
				return { error: `読み込めません: ${errorMessage(error)}` };
		}
	}
	try {
		return { data: JSON.parse(text) };
	} catch (error) {
		return { error: `JSON として読めません: ${errorMessage(error)}` };
	}
}

/** terms ディレクトリのファイルを読み込む。ディレクトリがなければ空の配列を返す */
async function readTerms(path: string): Promise<GlossaryInput["terms"]> {
	let entries: Dirent[];
	try {
		entries = await readdir(path, { withFileTypes: true });
	} catch (error) {
		if (errorCode(error) === "ENOENT") {
			return [];
		}
		throw error;
	}
	const sorted = entries.toSorted((a, b) =>
		a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
	);
	return Promise.all(
		sorted.map(async (entry) => {
			const fileName = entry.name;
			if (!entry.isFile()) {
				return { fileName, content: { error: "ファイル以外は置けません" } };
			}
			if (!fileName.endsWith(".json")) {
				return {
					fileName,
					content: { error: "JSON 以外のファイルは置けません" },
				};
			}
			return { fileName, content: await readJson(join(path, fileName)) };
		}),
	);
}

/**
 * glossaries ディレクトリから、用語集ごとにファイルを読み込む。
 * ディレクトリがなければ例外を投げる
 */
export async function loadGlossaries(root: string): Promise<GlossaryInput[]> {
	const directories = (await readdir(root, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.toSorted();
	return Promise.all(
		directories.map(async (directory) => ({
			directory,
			glossary: await readJson(join(root, directory, "glossary.json")),
			terms: await readTerms(join(root, directory, "terms")),
		})),
	);
}
