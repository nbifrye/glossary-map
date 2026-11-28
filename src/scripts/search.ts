import { normalize } from "../site/search.ts";

for (const root of document.querySelectorAll<HTMLElement>("[data-search]")) {
	const input = root.querySelector<HTMLInputElement>("input");
	const status = root.querySelector<HTMLElement>("[data-search-status]");
	const list = document.getElementById(root.dataset.search ?? "");
	if (input === null || status === null || list === null) {
		continue;
	}
	const items = [...list.querySelectorAll<HTMLElement>("li[data-keywords]")];
	const update = () => {
		const query = normalize(input.value.trim());
		let count = 0;
		for (const item of items) {
			const matched =
				query === "" || (item.dataset.keywords ?? "").includes(query);
			item.hidden = !matched;
			if (matched) {
				count++;
			}
		}
		status.textContent =
			query === "" ? "" : `${count} 語の用語が見つかりました。`;
	};
	input.addEventListener("input", update);
	root.hidden = false;
	update();
}
