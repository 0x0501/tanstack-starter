import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { env } from "@/env";
import { PasswordOtpEmail } from "@/integrations/react-email/PasswordOtpEmail";
import { ResetPasswordEmail } from "@/integrations/react-email/ResetPasswordEmail";
import { VerifyEmail } from "@/integrations/react-email/VerifyEmail";
import * as m from "@/paraglide/messages";

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
		// Through `unknown`: the generated `Env` declares `EMAIL` with wrangler's
		// own message type, which is structurally unrelated to the narrow shape
		// this module actually sends.
		return (CFEnv as unknown as { EMAIL?: EmailBinding }).EMAIL ?? null;
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

/**
 * The recipient's own language, not the sender's.
 *
 * An email is rendered inside whatever request happened to trigger it — a
 * webhook, a cron, another person's session — so ambient locale is the wrong
 * source. Callers pass the account's stored `user.locale`; an account that has
 * never chosen one falls back to the base locale rather than to the locale of
 * whoever caused the send.
 */
type MailLocale = "en" | "de";

export function mailLocale(value: string | null | undefined): MailLocale {
	return value === "de" ? "de" : "en";
}

export async function sendVerificationEmail(opts: {
	to: string;
	url: string;
	name?: string;
	locale?: string | null;
}): Promise<void> {
	const locale = mailLocale(opts.locale);
	await send({
		to: opts.to,
		subject: m.email_verify_subject({}, { locale }),
		email: (
			<VerifyEmail
				url={opts.url}
				name={opts.name}
				brandName={env.EMAIL_FROM_NAME}
				locale={locale}
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
	locale?: string | null;
}): Promise<void> {
	const locale = mailLocale(opts.locale);
	await send({
		to: opts.to,
		subject: m.email_reset_subject({}, { locale }),
		email: (
			<ResetPasswordEmail
				url={opts.url}
				name={opts.name}
				brandName={env.EMAIL_FROM_NAME}
				locale={locale}
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
	locale?: string | null;
}): Promise<void> {
	const locale = mailLocale(opts.locale);
	const subject =
		opts.type === "forget-password"
			? m.email_otp_subject_reset({}, { locale })
			: m.email_otp_subject_signin({}, { locale });
	await send({
		to: opts.to,
		subject,
		email: (
			<PasswordOtpEmail
				otp={opts.otp}
				purpose={opts.type}
				brandName={env.EMAIL_FROM_NAME}
				locale={locale}
			/>
		),
		devLabel: "OTP",
		devDetail: opts.otp,
	});
}
