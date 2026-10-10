// One catalog drives prompts, flag validation and adapter composition.
export const catalog = {
	database: [
		{
			id: "pg",
			label: "PostgreSQL",
			hint: "Direct connection",
			requires: { deployment: ["nitro", "bun"] },
		},
		{
			id: "pg-hyperdrive",
			label: "PostgreSQL (Hyperdrive)",
			hint: "Cloudflare connection pooling",
			requires: { deployment: ["cloudflare"] },
		},
		{
			id: "d1",
			label: "Cloudflare D1",
			requires: { deployment: ["cloudflare"] },
		},
		{
			id: "turso-cloud",
			label: "Turso Cloud",
			hint: "Remote database with URL and auth token",
		},
		{
			id: "turso-local",
			label: "Turso Local (libSQL)",
			hint: "Local database file",
			requires: { deployment: ["nitro", "bun"] },
		},
		{
			id: "bun-sqlite",
			label: "Bun SQLite",
			hint: "Native bun:sqlite driver",
			requires: { deployment: ["bun"] },
		},
	],
	deployment: [
		{ id: "cloudflare", label: "Cloudflare Workers" },
		{ id: "nitro", label: "Nitro (Node.js)" },
		{ id: "bun", label: "Bun native server" },
	],
	email: [
		{
			id: "cloudflare",
			label: "Cloudflare Email",
			requires: { deployment: ["cloudflare"] },
		},
		{ id: "resend", label: "Resend" },
	],
	payments: [
		{ id: "stripe", label: "Stripe" },
		{ id: "creem", label: "Creem.io" },
		{ id: "nowpayments", label: "NOWPayments" },
		{ id: "polar", label: "Polar" },
	],
};

export const defaults = {
	database: "pg-hyperdrive",
	deployment: "cloudflare",
	email: "cloudflare",
	payments: ["stripe"],
};

export function incompatibilities(selection) {
	const errors = [];
	for (const [category, options] of Object.entries(catalog)) {
		const ids =
			category === "payments"
				? (selection.payments ?? [])
				: [selection[category]];
		for (const id of ids) {
			if (id === undefined) continue;
			const option = options.find((entry) => entry.id === id);
			if (!option) {
				errors.push(
					`Unknown ${category} option: ${id}. Choose ${options.map((entry) => entry.id).join(", ")}.`,
				);
				continue;
			}
			for (const [dependency, allowed] of Object.entries(
				option.requires ?? {},
			)) {
				if (selection[dependency] && !allowed.includes(selection[dependency])) {
					errors.push(
						`${option.label} requires ${allowed.map((id) => catalog[dependency].find((entry) => entry.id === id).label).join(" or ")}.`,
					);
				}
			}
		}
	}
	return errors;
}

export function choices(category, selection) {
	return catalog[category].map((option) => {
		const reason = incompatibilities({
			...selection,
			[category]: option.id,
		}).join(" ");
		return {
			value: option.id,
			name: option.label,
			hint: option.hint,
			...(reason ? { disabled: reason } : {}),
		};
	});
}

export function isPostgres(database) {
	return database === "pg" || database === "pg-hyperdrive";
}

export function validateSelection(selection) {
	for (const category of Object.keys(catalog)) {
		if (selection[category] === undefined)
			throw new Error(`Missing ${category} selection.`);
	}
	if (!Array.isArray(selection.payments))
		throw new Error("payments must be an array.");
	if (new Set(selection.payments).size !== selection.payments.length)
		throw new Error("Duplicate payment providers.");
	const errors = incompatibilities(selection);
	if (errors.length) throw new Error(errors.join("\n"));
	return selection;
}
