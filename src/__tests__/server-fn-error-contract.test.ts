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
import { startInstance } from "@/start";
import { HttpError, userFacingMessage } from "@/utils/api-error";

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
