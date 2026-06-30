import { env as CFEnv } from "cloudflare:workers";
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { env } from "@/env";
import { ResetPasswordEmail } from "@/integrations/react-email/ResetPasswordEmail";
import { VerifyEmail } from "@/integrations/react-email/VerifyEmail";

async function send(opts: {
	to: string;
	subject: string;
	email: ReactElement;
	// Logged when the email binding can't deliver (e.g. local dev), so the flow
	// stays testable without sending a real message.
	devLabel: string;
	devUrl: string;
}): Promise<void> {
	const html = await render(opts.email);
	const text = await render(opts.email, { plainText: true });
	try {
		// Cloudflare Email Sending — the `send_email` binding `EMAIL`. The sender
		// address must be on a domain verified in the Cloudflare Email Service.
		await CFEnv.EMAIL.send({
			from: env.EMAIL_FROM,
			to: opts.to,
			subject: opts.subject,
			html,
			text,
		});
	} catch (error) {
		console.warn(
			`[email] ${opts.devLabel} for ${opts.to}: ${opts.devUrl}`,
			error,
		);
	}
}

export async function sendVerificationEmail(opts: {
	to: string;
	url: string;
	name?: string;
}): Promise<void> {
	await send({
		to: opts.to,
		subject: "Confirm your email",
		email: <VerifyEmail url={opts.url} name={opts.name} />,
		devLabel: "verification link",
		devUrl: opts.url,
	});
}

export async function sendResetPasswordEmail(opts: {
	to: string;
	url: string;
	name?: string;
}): Promise<void> {
	await send({
		to: opts.to,
		subject: "Reset your password",
		email: <ResetPasswordEmail url={opts.url} name={opts.name} />,
		devLabel: "password reset link",
		devUrl: opts.url,
	});
}
