export type Inline =
	| { type: "text"; value: string }
	| { type: "emphasis"; children: Inline[] }
	| { type: "link"; href: string; children: Inline[] };

export type Block =
	| { type: "paragraph"; children: Inline[] }
	| { type: "list"; ordered: boolean; items: Block[][] };

export interface Criterion {
	id: string;
	description: string;
}

export interface Glossary {
	id: string;
	title: string;
	source: {
		name: string;
		version: string;
		published: string;
		url: string;
		retrieved: string;
	};
	criteria: Criterion[];
}

export interface Definition {
	location: { url?: string; label?: string };
	source: Block[];
	translation: { content: Block[]; sourceHash: string };
}

export interface Reference {
	definition: number;
	target: { glossary: string; term: string };
	start: number;
	end: number;
	text: string;
	criterion: string;
}

export interface Term {
	heading: string;
	headingTranslation: { text: string; sourceHash: string };
	definitions: Definition[];
	references: Reference[];
}
