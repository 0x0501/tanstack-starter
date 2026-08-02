/**
 * Reading a request body behind a hard cap.
 *
 * A `Content-Length` check alone is bypassed by a chunked request — the header
 * is absent and the guard never fires — so the cap has to count bytes as they
 * arrive. Public webhooks must not buffer an unbounded body before the
 * signature is verified.
 *
 * `readTextCapped` hands back the raw string, not parsed JSON: webhooks verify
 * signatures over the exact characters received.
 *
 * Framework-agnostic and binding-free — no `cloudflare:workers` import.
 */

export class BodyTooLargeError extends Error {
	constructor() {
		super("Request body is too large.");
		this.name = "BodyTooLargeError";
	}
}

export class UnsupportedMediaTypeError extends Error {
	constructor() {
		super("Request body must be application/json.");
		this.name = "UnsupportedMediaTypeError";
	}
}

export type CappedReadOptions = {
	maxBytes: number;
	/** Require an `application/json` content type. Default true. */
	requireJson?: boolean;
};

function assertJsonContentType(request: Request): void {
	const header = request.headers.get("content-type") ?? "";
	const mediaType = header.split(";")[0].trim().toLowerCase();
	if (mediaType !== "application/json") throw new UnsupportedMediaTypeError();
}

/**
 * Read the body as text, refusing anything over `maxBytes` whether or not a
 * `Content-Length` was declared. Returns `""` when there is no body.
 */
export async function readTextCapped(
	request: Request,
	{ maxBytes, requireJson = true }: CappedReadOptions,
): Promise<string> {
	if (requireJson) assertJsonContentType(request);

	const declared = request.headers.get("content-length");
	if (declared && Number(declared) > maxBytes) throw new BodyTooLargeError();

	const reader = request.body?.getReader();
	if (!reader) return "";

	const decoder = new TextDecoder();
	let text = "";
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw new BodyTooLargeError();
		}
		text += decoder.decode(value, { stream: true });
	}

	return text + decoder.decode();
}

/**
 * Same cap, parsed. Returns `{}` for a body-less request.
 */
export async function readJsonCapped(
	request: Request,
	options: CappedReadOptions,
): Promise<unknown> {
	const text = await readTextCapped(request, options);
	if (text === "") return {};
	return JSON.parse(text);
}
