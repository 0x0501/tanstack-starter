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
