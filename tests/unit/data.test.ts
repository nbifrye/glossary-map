import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Term } from "../../src/data/types.ts";
import { loadSite } from "../../src/site/data.ts";

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "site-"));
	await cp("tests/fixtures/glossaries", root, { recursive: true });
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const termFile = (slug: string) =>
	join(root, "example", "terms", `${slug}.json`);

async function editTerm(slug: string, edit: (term: Term) => void) {
	const term = JSON.parse(await readFile(termFile(slug), "utf8"));
	edit(term);
	await writeFile(termFile(slug), JSON.stringify(term));
}

describe("loadSite", () => {
	test("用語を見出しの順に並べ、ファイル名をスラッグにする", async () => {
		const [entry] = await loadSite(root);
		expect(entry?.glossary.id).toBe("example");
		expect(entry?.terms.map(({ slug }) => slug)).toEqual([
			"identity-service",
			"subscriber",
		]);
		expect(entry?.bySlug.get("subscriber")?.term.heading).toBe("subscriber");
	});

	test("参照先ごとに参照元の参照をまとめる", async () => {
		const [entry] = await loadSite(root);
		const incoming = entry?.incoming.get("subscriber") ?? [];
		expect(incoming.map(({ source }) => source.slug)).toEqual([
			"identity-service",
		]);
		expect(incoming[0]?.reference.text).toBe("subscriber");
	});

	test("参照を原文中の位置の順に並べ、自身への参照も参照元に含める", async () => {
		await editTerm("identity-service", (term) => {
			term.references.push({
				definition: 0,
				target: { glossary: "example", term: "identity-service" },
				start: 2,
				end: 9,
				text: "service",
				criterion: "heading",
			});
		});
		const [entry] = await loadSite(root);
		const item = entry?.bySlug.get("identity-service");
		expect(item?.term.references.map(({ start }) => start)).toEqual([2, 20]);
		expect(
			entry?.incoming
				.get("identity-service")
				?.map(({ source }) => source.slug)
				.toSorted(),
		).toEqual(["identity-service", "subscriber"]);
	});

	test("検証で問題が見つかった場合は例外を投げ、直した後は読み込み直せる", async () => {
		await editTerm("subscriber", (term) => {
			term.references = term.references.map((reference) => ({
				...reference,
				text: "identity",
			}));
		});
		await expect(loadSite(root)).rejects.toThrow(
			`${root}/example/terms/subscriber.json`,
		);
		await editTerm("subscriber", (term) => {
			term.references = term.references.map((reference) => ({
				...reference,
				text: "identity service",
			}));
		});
		await expect(loadSite(root)).resolves.toHaveLength(1);
	});
});
