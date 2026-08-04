import type { z } from "zod";

export type APIErrorProp = {
	status: number;
	error: string;
	message: string;
};

export function APIError({ status, error, message }: APIErrorProp) {
	return Response.json(
		{
			status,
			error,
			message,
		},
		{ status },
	);
}

/**
 * An API route's answer to a method it does not serve.
 *
 * Without one, a route that declares only POST leaves a browser's GET to fall
 * through to the app router, which answers 200 with the whole SPA shell and no
 * dehydrated router state — so the page loads and then fails to hydrate in the
 * reader's browser. An API path has to answer as an API (ADR 0010).
 *
 * Routes wire this to GET and nothing else, deliberately. GET is the method a
 * browser sends and the only one that produces the rendered body the failure
 * needs; HEAD carries none, and answering OPTIONS here would put a 405 in front
 * of a CORS preflight, which is a different question from this one.
 */
export function methodNotAllowed(allow: string) {
	const response = APIError({
		status: 405,
		error: "method_not_allowed",
		message: `This endpoint accepts ${allow} only.`,
	});
	response.headers.set("Allow", allow);
	return response;
}

/**
 * A server function's refusal, as an Error rather than a Response.
 *
 * A `Response` returned from server-fn middleware is stamped as a deliberate
 * raw success and handed to the client as the resolved query value — so a 401
 * arrives as *data*, TanStack Query caches it, and a component expecting an
 * array crashes while one expecting an object renders a confident zero.
 * Throwing this instead makes a refusal a rejected query, which nothing can
 * mistake for a result.
 *
 * It survives the wire only because `src/start.ts` registers a serialization
 * adapter for it. Without that, the router's shallow error serializer keeps
 * `message` and drops every custom property — including `.status`.
 *
 * `APIError` above stays for route handlers and the OAuth surface, which
 * legitimately answer with a `Response`.
 */
export class HttpError extends Error {
	readonly status: number;
	readonly error: string;

	constructor({ status, error, message }: APIErrorProp) {
		super(message);
		this.name = "HttpError";
		this.status = status;
		this.error = error;
	}
}

/**
 * What a failed call may tell the user.
 *
 * Only a 4xx `HttpError` message is written for them — a refused name states
 * the rule, so showing it is the difference between correcting the name and
 * retrying it forever. Everything else (a 5xx, a stray `TypeError`) carries
 * internal detail written for us, and gets the caller's own wording.
 */
export function userFacingMessage(error: unknown, fallback: string): string {
	if (!(error instanceof HttpError)) return fallback;
	return error.status >= 400 && error.status < 500 ? error.message : fallback;
}

/**
 * What a caller is told when a field breaks a rule nobody wrote out.
 *
 * zod's own wording is written for whoever wrote the schema, not for the person
 * who typed the value: "Invalid string: must match pattern /^\d{4}-\d{2}-\d{2}$/"
 * hands the reader a regular expression, and "Too small: expected string to have
 * >=1 characters" reads like a stack frame. Neither may be shown (ADR 0010).
 */
const INVALID_INPUT = "That input isn't valid.";

/**
 * The one way a server function declares its input (ADR 0010).
 *
 * `.validator(schema)` and `.validator((d) => schema.parse(d))` both leave the
 * framework's `execValidator` to throw: the first as an `Error` whose message
 * is a JSON dump of the schema's issues, the second as a bare `ZodError`.
 * Neither carries `.status`, so a caller who mistypes a field is shown a dump
 * written for nobody, and an expected 4xx reaches error reporting as a crash.
 *
 * Wrapping the schema makes that refusal a 400 like every other, which is all
 * it takes — the status is what every downstream filter reads.
 */
export function validated<TSchema extends z.ZodType>(
	schema: TSchema,
): (input: z.input<TSchema>) => z.output<TSchema> {
	// Declared as the schema's own input, not `unknown`: the framework reads this
	// signature to decide whether `data` is required at the call site, and
	// `unknown` accepts `undefined` — so typing it honestly would quietly make
	// every wrapped server function's argument optional. Nothing is lost, since
	// what actually arrives is parsed rather than trusted.
	return (input: unknown) => {
		// A message the schema's author wrote outranks this map, and a message zod
		// would have generated does not — so an authored rule still reaches the
		// reader while zod's own wording can never be what they see.
		const parsed = schema.safeParse(input, { error: () => INVALID_INPUT });
		if (parsed.success) return parsed.data;
		throw new HttpError({
			status: 400,
			error: "invalid_param",
			// The first issue's message only: its `path`, `code` and the shape of
			// the rest of the array are internal.
			message: parsed.error.issues[0]?.message ?? INVALID_INPUT,
		});
	};
}
