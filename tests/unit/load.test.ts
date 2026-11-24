import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { loadGlossaries } from "../../src/data/load.ts";

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "glossaries-"));
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

async function write(path: string, content: string) {
	const file = join(root, path);
	await mkdir(join(file, ".."), { recursive: true });
	await writeFile(file, content);
}

describe("loadGlossaries", () => {
	test("ディレクトリがなければ例外を投げる", async () => {
		await expect(loadGlossaries(join(root, "missing"))).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	test("用語集を名前の順に読み込み、ディレクトリ以外は無視する", async () => {
		await write("b/glossary.json", '{"id":"b"}');
		await write("a/glossary.json", '{"id":"a"}');
		await write("README.md", "");
		const glossaries = await loadGlossaries(root);
		expect(glossaries.map(({ directory }) => directory)).toEqual(["a", "b"]);
		expect(glossaries[0]).toEqual({
			directory: "a",
			glossary: { data: { id: "a" } },
			terms: [],
		});
	});

	test("glossary.json がない", async () => {
		await mkdir(join(root, "a"));
		const [glossary] = await loadGlossaries(root);
		expect(glossary?.glossary).toEqual({ error: "ファイルがありません" });
	});

	test("読み込めないファイルがあっても、ほかのファイルを読み込む", async () => {
		await write("a/glossary.json", "{");
		await write("a/terms/broken.json", "[1,]");
		await write("a/terms/ok.json", "{}");
		await write("a/terms/notes.txt", "");
		await mkdir(join(root, "a/terms/directory.json"));
		const [glossary] = await loadGlossaries(root);
		expect(glossary?.glossary).toMatchObject({
			error: expect.stringMatching(/^JSON として読めません: /),
		});
		expect(glossary?.terms).toEqual([
			{
				fileName: "broken.json",
				content: { error: expect.stringMatching(/^JSON として読めません: /) },
			},
			{
				fileName: "directory.json",
				content: { error: "ファイル以外は置けません" },
			},
			{
				fileName: "notes.txt",
				content: { error: "JSON 以外のファイルは置けません" },
			},
			{ fileName: "ok.json", content: { data: {} } },
		]);
	});
});
