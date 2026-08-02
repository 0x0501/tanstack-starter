import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { env } from "@/env";
import { PasswordOtpEmail } from "@/integrations/react-email/PasswordOtpEmail";
import { ResetPasswordEmail } from "@/integrations/react-email/ResetPasswordEmail";
import { VerifyEmail } from "@/integrations/react-email/VerifyEmail";

type EmailBinding = {
	send: (msg: {
		from: { email: string; name: string };
		to: string;
		subject: string;
		html: string;
		text: string;
	}) => Promise<void>;
};

async function emailBinding(): Promise<EmailBinding | null> {
	try {
		const { env: CFEnv } = await import("cloudflare:workers");
		return (CFEnv as { EMAIL?: EmailBinding }).EMAIL ?? null;
	} catch {
		return null;
	}
}

async function send(opts: {
	to: string;
	subject: string;
	email: ReactElement;
	devLabel: string;
	/** Dev-only detail (URLs / OTPs). Never logged in production. */
	devDetail: string;
}): Promise<void> {
	const [html, text] = await Promise.all([
		render(opts.email),
		render(opts.email, { plainText: true }),
	]);
	const binding = await emailBinding();
	if (!binding) {
		if (import.meta.env.DEV) {
			console.warn(
				`[email] ${opts.devLabel} for ${opts.to}: ${opts.devDetail}`,
			);
		} else {
			console.warn(
				`[email] ${opts.devLabel} skipped (no binding) for ${opts.to}`,
			);
		}
		return;
	}
	try {
		await binding.send({
			from: { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME },
			to: opts.to,
			subject: opts.subject,
			html,
			text,
		});
	} catch (error) {
		if (import.meta.env.DEV) {
			console.warn(
				`[email] ${opts.devLabel} for ${opts.to}: ${opts.devDetail}`,
				error,
			);
		} else {
			console.warn(`[email] ${opts.devLabel} failed for ${opts.to}`, error);
		}
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
		email: (
			<VerifyEmail
				url={opts.url}
				name={opts.name}
				brandName={env.EMAIL_FROM_NAME}
			/>
		),
		devLabel: "verification link",
		devDetail: opts.url,
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
		email: (
			<ResetPasswordEmail
				url={opts.url}
				name={opts.name}
				brandName={env.EMAIL_FROM_NAME}
			/>
		),
		devLabel: "password reset link",
		devDetail: opts.url,
	});
}

export async function sendPasswordOtpEmail(opts: {
	to: string;
	otp: string;
	type: "forget-password" | "sign-in";
}): Promise<void> {
	const subject =
		opts.type === "forget-password"
			? "Your password reset code"
			: "Your sign-in code";
	await send({
		to: opts.to,
		subject,
		email: (
			<PasswordOtpEmail
				otp={opts.otp}
				purpose={opts.type}
				brandName={env.EMAIL_FROM_NAME}
			/>
		),
		devLabel: "OTP",
		devDetail: opts.otp,
	});
}
