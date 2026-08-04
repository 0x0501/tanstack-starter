/**
 * Seam: the application's own Start configuration, round-tripped through the
 * real serializer.
 *
 * The defect being pinned is a *registration* failure, not a throwing failure.
 * A test that asserts "the middleware throws an HttpError" passes happily
 * against a production build that never registered the adapter — and in that
 * build every refusal still arrives as a bare `Error` whose `.status` the
 * shallow error serializer dropped. So the adapter list is read from
 * `startInstance` itself and composed the way the framework composes it
 * (user adapters ahead of the default `ShallowErrorPlugin`), then an HttpError
 * is pushed through real seroval.
 *
 * The plain-`Error` case is the sensitivity check: it degrades, so a passing
 * positive case is known to come from the adapter rather than from seroval
 * being generous.
 */
import {
	defaultSerovalPlugins,
	makeSerovalPlugin,
} from "@tanstack/router-core";
import { fromJSON, toJSONAsync } from "seroval";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { startInstance } from "@/start";
import {
	HttpError,
	methodNotAllowed,
	userFacingMessage,
	validated,
} from "@/utils/api-error";

/** What the client ends up holding after a server function rejects. */
async function acrossTheServerFnBoundary(thrown: unknown) {
	const { serializationAdapters } = await startInstance.getOptions();
	const plugins = [
		...(serializationAdapters ?? []).map(makeSerovalPlugin),
		...defaultSerovalPlugins,
	];
	return fromJSON(await toJSONAsync(thrown, { plugins }), { plugins });
}

describe("a server function's refusal crossing the wire", () => {
	it("arrives with its status, code, message and class intact", async () => {
		const crossed = await acrossTheServerFnBoundary(
			new HttpError({
				status: 401,
				error: "unauthorized",
				message: "Authentication required.",
			}),
		);

		expect(crossed).toBeInstanceOf(HttpError);
		expect(crossed).toMatchObject({
			status: 401,
			error: "unauthorized",
			message: "Authentication required.",
		});
	});

	it("degrades a plain Error, so this suite fails if the adapter goes unregistered", async () => {
		const crossed = await acrossTheServerFnBoundary(
			Object.assign(new Error("Authentication required."), { status: 401 }),
		);

		expect(crossed).not.toBeInstanceOf(HttpError);
		expect((crossed as { status?: number }).status).toBeUndefined();
	});
});

/**
 * A 4xx `message` is trustworthy enough to render. Everything else (5xx,
 * stray TypeError) carries internal detail and gets the caller's fallback.
 */
describe("the message a client may show the user", () => {
	const fallback = "Something went wrong. Please try again.";

	it("shows a 4xx message, because it was written for them", () => {
		const refusal = new HttpError({
			status: 400,
			error: "invalid_param",
			message: "Display name is required.",
		});

		expect(userFacingMessage(refusal, fallback)).toBe(
			"Display name is required.",
		);
	});

	it("hides a 5xx message, because it was not", () => {
		const fault = new HttpError({
			status: 500,
			error: "internal",
			message: "ECONNREFUSED 10.0.0.4:5432",
		});

		expect(userFacingMessage(fault, fallback)).toBe(fallback);
	});

	it("hides an ordinary Error, whose message is never intended for a user", () => {
		expect(
			userFacingMessage(new TypeError("p.map is not a function"), fallback),
		).toBe(fallback);
	});
});

describe("a validator's refusal", () => {
	/** A field whose author wrote the rule out for the reader. */
	const authored = z.object({
		date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD form."),
	});
	/** The same field with no message — the shape most of the codebase has. */
	const bare = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

	// The cast is the point of the test: a validator's declared input describes
	// what the *call site* may pass, while what actually arrives over the wire
	// is whatever the caller sent. These are the shapes the type system promises
	// cannot happen and the network delivers anyway.
	function refusalFrom<T extends z.ZodType>(schema: T, input: unknown) {
		try {
			validated(schema)(input as z.input<T>);
		} catch (error) {
			return error;
		}
		throw new Error("expected the validator to refuse");
	}

	it("is a refusal and not a fault, so a malformed call is an expected 4xx", async () => {
		const crossed = await acrossTheServerFnBoundary(
			refusalFrom(authored, undefined),
		);
		expect(crossed).toBeInstanceOf(HttpError);
		expect(crossed).toMatchObject({ status: 400, error: "invalid_param" });
	});

	it("states the rule the input broke, when the schema's author wrote one", async () => {
		const crossed = await acrossTheServerFnBoundary(
			refusalFrom(authored, { date: "3 August" }),
		);
		expect(userFacingMessage(crossed, "Something went wrong.")).toBe(
			"Use the YYYY-MM-DD form.",
		);
	});

	// zod's own wording is written for whoever wrote the schema: "Invalid
	// string: must match pattern /^\d{4}-\d{2}-\d{2}$/" hands the reader a
	// regular expression. Most schemas here carry no message, so this is the
	// common case, not the edge one.
	it("never falls back to zod's wording, which is written for a machine", () => {
		const refusal = refusalFrom(bare, { date: "3 August" });
		const shown = userFacingMessage(refusal, "Something went wrong.");
		expect(shown).not.toContain("\\d");
		expect(shown).not.toContain("Invalid");
		expect(shown).not.toContain("pattern");
	});

	it("says nothing about the schema when the payload is missing entirely", () => {
		const refusal = refusalFrom(bare, undefined);
		const shown = userFacingMessage(refusal, "Something went wrong.");
		expect(shown).not.toContain("date");
		expect(shown).not.toContain("undefined");
	});

	it("passes valid input through, so the handler still receives parsed data", () => {
		expect(validated(bare)({ date: "2026-08-03" })).toEqual({
			date: "2026-08-03",
		});
	});
});

describe("an API route asked for a method it does not serve", () => {
	// Without this, a POST-only route lets a browser's GET fall through to the
	// app router, which answers 200 with the whole SPA shell — a webhook URL
	// that renders a page instead of refusing.
	it("answers 405 as JSON, and names the method it does serve", async () => {
		const response = methodNotAllowed("POST");

		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("POST");
		expect(response.headers.get("content-type")).toContain("application/json");
		await expect(response.json()).resolves.toMatchObject({
			status: 405,
			error: "method_not_allowed",
		});
	});
});
