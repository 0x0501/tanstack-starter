import { createMiddleware } from "@tanstack/react-start";
import {
	BodyTooLargeError,
	readTextCapped,
	UnsupportedMediaTypeError,
} from "@/utils/body-limit";

/**
 * Generous for a JSON callback, small enough that an unauthenticated caller
 * cannot spend the Worker's memory at will.
 */
export const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

/**
 * Read the request body once, behind a hard cap, and expose the capped raw
 * string as `context.rawBody`.
 *
 * Raw text rather than parsed JSON on purpose: webhooks verify signatures over
 * the exact characters received, so re-serialising would break verification.
 * Handlers that want an object parse `context.rawBody` themselves.
 *
 * This is a *route* middleware, so a refusal is a returned `Response` — the
 * `HttpError` rule in `utils/api-error` covers server-function middleware,
 * where a returned Response would be stamped as data. Same reason
 * `auth-rate-limit` answers 429 the same way.
 */
export function bodyLimitMiddleware(maxBytes: number) {
	return createMiddleware().server(async ({ request, next }) => {
		let rawBody: string;
		try {
			rawBody = await readTextCapped(request, { maxBytes });
		} catch (error) {
			if (error instanceof BodyTooLargeError) {
				return Response.json(
					{
						status: 413,
						error: "payload_too_large",
						message: error.message,
					},
					{ status: 413 },
				);
			}
			if (error instanceof UnsupportedMediaTypeError) {
				return Response.json(
					{
						status: 415,
						error: "unsupported_media_type",
						message: error.message,
					},
					{ status: 415 },
				);
			}
			throw error;
		}
		return next({ context: { rawBody } });
	});
}

/** The cap on a public, unauthenticated payment webhook. */
export const webhookBodyLimitMiddleware = bodyLimitMiddleware(
	MAX_WEBHOOK_BODY_BYTES,
);
