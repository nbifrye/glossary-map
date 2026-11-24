import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://nbifrye.github.io",
	base: "/glossary-map",
	trailingSlash: "always",
	security: {
		csp: {
			directives: [
				"default-src 'self'",
				"object-src 'none'",
				"base-uri 'self'",
				"form-action 'self'",
			],
		},
	},
});
