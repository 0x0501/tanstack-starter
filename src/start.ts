/**
 * Global Start config: CSRF for server functions + HttpError wire serialization.
 * Locale is handled by paraglideMiddleware + router rewrite — not here.
 */
import { createSerializationAdapter } from "@tanstack/react-router";
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { HttpError } from "@/utils/api-error";

const csrfMiddleware = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
});

// A thrown HttpError has to reach the client with its status intact. User
// adapters are composed *ahead* of the router's default shallow error
// serializer, so this one matches first and the shallow one never sees the
// value; without it a refusal degrades to a bare `Error` carrying only
// `message`.
//
// This registration is load-bearing and must never lag behind the middleware
// that throw: shipping the throws alone loses `.status` on the wire.
const httpErrorAdapter = createSerializationAdapter({
	key: "tanstack-starter/HttpError",
	test: (value): value is HttpError => value instanceof HttpError,
	toSerializable: ({ status, error, message }: HttpError) => ({
		status,
		error,
		message,
	}),
	fromSerializable: (value) => new HttpError(value),
});

export const startInstance = createStart(() => ({
	serializationAdapters: [httpErrorAdapter],
	requestMiddleware: [csrfMiddleware],
}));
