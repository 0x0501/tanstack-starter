import { describe, expect, it } from "vitest";
import { BodyTooLargeError, readJsonCapped } from "@/utils/body-limit";

function requestFromChunks(chunks: Uint8Array[]): Request {
	let next = 0;
	return new Request("http://local/body", {
		method: "POST",
		body: new ReadableStream<Uint8Array>({
			pull(controller) {
				const chunk = chunks[next++];
				if (chunk) controller.enqueue(chunk);
				else controller.close();
			},
		}),
		duplex: "half",
	} as RequestInit);
}

describe("readJsonCapped", () => {
	it("decodes JSON split across UTF-8 byte boundaries", async () => {
		const bytes = new TextEncoder().encode(
			JSON.stringify({ message: "你好，Starter" }),
		);
		const value = await readJsonCapped(
			requestFromChunks([
				bytes.slice(0, 14),
				bytes.slice(14, 15),
				bytes.slice(15),
			]),
			{ maxBytes: bytes.byteLength, requireJson: false },
		);

		expect(value).toEqual({ message: "你好，Starter" });
	});

	it("rejects a chunked body as soon as its cumulative bytes exceed the cap", async () => {
		await expect(
			readJsonCapped(
				requestFromChunks([
					new TextEncoder().encode('{"a":'),
					new TextEncoder().encode('"too-large"}'),
				]),
				{ maxBytes: 8, requireJson: false },
			),
		).rejects.toBeInstanceOf(BodyTooLargeError);
	});
});
