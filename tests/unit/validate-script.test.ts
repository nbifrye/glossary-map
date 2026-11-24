import { execFile } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const script = resolve("scripts/validate.ts");

const run = async (args: string[], cwd = process.cwd()) => {
	try {
		const { stdout, stderr } = await promisify(execFile)(
			process.execPath,
			[script, ...args],
			{ cwd },
		);
		return { code: 0, stdout, stderr };
	} catch (error) {
		const { code, stdout, stderr } = error as {
			code: number;
			stdout: string;
			stderr: string;
		};
		return { code, stdout, stderr };
	}
};

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "glossaries-"));
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

describe("scripts/validate.ts", () => {
	test("問題がなければ、終了コード 0 で終わる", async () => {
		expect(await run(["tests/fixtures/glossaries"])).toEqual({
			code: 0,
			stdout: "1 件の用語集を検証しました\n",
			stderr: "",
		});
	});

	test("問題があれば、ファイルごとに内容を表示し、終了コード 1 で終わる", async () => {
		await cp("tests/fixtures/glossaries", root, { recursive: true });
		await writeFile(join(root, "example/terms/subscriber.json"), "{");
		await writeFile(join(root, "example/terms/notes.txt"), "");
		const result = await run([root]);
		expect(result.code).toBe(1);
		const lines = result.stderr.trimEnd().split("\n");
		expect(lines).toEqual([
			`${root}/example/terms/notes.txt: JSON 以外のファイルは置けません`,
			expect.stringMatching(
				new RegExp(
					`^${root}/example/terms/subscriber\\.json: JSON として読めません: `,
				),
			),
			"2 件の問題が見つかりました",
		]);
	});

	test("指定したディレクトリがなければ、終了コード 1 で終わる", async () => {
		const missing = join(root, "missing");
		const result = await run([missing]);
		expect(result.code).toBe(1);
		expect(result.stderr).toMatch(new RegExp(`^${missing} を読み込めません: `));
	});

	test("引数がなく、glossaries ディレクトリもなければ、終了コード 0 で終わる", async () => {
		expect(await run([], root)).toEqual({
			code: 0,
			stdout: "0 件の用語集を検証しました\n",
			stderr: "",
		});
	});
});
