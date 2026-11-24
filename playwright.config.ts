import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "tests/browser",
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: "http://localhost:4322/glossary-map/",
	},
	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
		{ name: "firefox", use: { ...devices["Desktop Firefox"] } },
		{ name: "webkit", use: { ...devices["Desktop Safari"] } },
	],
	webServer: {
		command: "npm run preview -- --port 4322 --ignore-lock",
		url: "http://localhost:4322/glossary-map/",
		reuseExistingServer: false,
	},
});
