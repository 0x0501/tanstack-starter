import { replace, text } from "../template.mjs";

export async function configureEmail({ files, selection }) {
	const original = text(files, "src/lib/email.tsx");
	const start = original.indexOf("type EmailBinding =");
	const end = original.indexOf("/**\n * The recipient's own language");
	if (start < 0 || end < 0) throw new Error("Email template anchors changed.");
	files.set(
		"src/lib/email.tsx",
		`import { sendEmail } from "./email-transport";\n${original.slice(0, start)}${send}\n${original.slice(end)}`,
	);
	if (selection.email === "resend") {
		replace(
			files,
			"scripts/validate-prod-env.ts",
			'\t"EMAIL_FROM",',
			'\t"EMAIL_FROM",\n\t"RESEND_API_KEY",',
		);
		files.set("src/lib/email-transport.ts", resend);
		replace(
			files,
			"src/env.ts",
			"\t\t\tEMAIL_FROM: z.string().min(1),",
			"\t\t\tRESEND_API_KEY: z.string().optional(),\n\t\t\tEMAIL_FROM: z.string().min(1),",
		);
		files.set(
			".env.example",
			`${text(files, ".env.example")}\n# Resend: verify your sender domain before production use.\nRESEND_API_KEY=\n`,
		);
		if (selection.deployment === "cloudflare") {
			replace(files, "worker-configuration.d.ts", "\tEMAIL: SendEmail;\n", "");
			const config = text(files, "wrangler.jsonc");
			files.set(
				"wrangler.jsonc",
				config.replace(/\t"send_email": \[[\s\S]*?\n\t\],\n/, ""),
			);
		}
	} else files.set("src/lib/email-transport.ts", cloudflare);
}

const send = `async function send(opts: {
	to: string;
	subject: string;
	email: ReactElement;
	devLabel: string;
	devDetail: string;
}): Promise<void> {
	const [html, text] = await Promise.all([render(opts.email), render(opts.email, { plainText: true })]);
	const sent = await sendEmail({ to: opts.to, subject: opts.subject, html, text });
	if (!sent) {
		if (!import.meta.env.DEV) throw new Error("Email transport is not configured.");
		console.warn(\`[email] $\{opts.devLabel} for $\{opts.to}: $\{opts.devDetail}\`);
	}
}
`;
const resend = `import { env } from "@/env";
export async function sendEmail(message: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
	if (!env.RESEND_API_KEY) return false;
	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: { authorization: \`Bearer $\{env.RESEND_API_KEY}\`, "content-type": "application/json" },
		body: JSON.stringify({ ...message, from: \`$\{env.EMAIL_FROM_NAME} <$\{env.EMAIL_FROM}>\` }),
	});
	if (!response.ok) throw new Error(\`Resend email failed ($\{response.status})\`);
	return true;
}
`;
const cloudflare = `import { env } from "@/env";
export async function sendEmail(message: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
	const { env: bindings } = await import("cloudflare:workers");
	if (!bindings.EMAIL) return false;
	await bindings.EMAIL.send({ ...message, from: { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME } });
	return true;
}
`;
