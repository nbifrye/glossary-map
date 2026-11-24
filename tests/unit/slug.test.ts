import { describe, expect, test } from "vitest";
import { slugify } from "../../src/data/slug.ts";

describe("slugify", () => {
	test.each([
		["authenticator", "authenticator"],
		[
			"Authentication Assurance Level (AAL)",
			"authentication-assurance-level-aal",
		],
		["  public-key  certificate ", "public-key-certificate"],
		["ＦＩＤＯ２", "fido2"],
		["Know-Your-Customer (KYC)", "know-your-customer-kyc"],
	])("%s は %s になる", (heading, slug) => {
		expect(slugify(heading)).toBe(slug);
	});

	test("英数字を含まない見出しは空文字列になる", () => {
		expect(slugify("認証器")).toBe("");
	});
});
