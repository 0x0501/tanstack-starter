import {
	Body,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Preview,
	Text,
} from "@react-email/components";

import * as m from "@/paraglide/messages";
import * as s from "./theme.ts";

/** See `VerifyEmail` for why `locale` is a prop rather than ambient state. */
export function PasswordOtpEmail({
	otp,
	brandName,
	purpose,
	locale,
}: {
	otp: string;
	brandName: string;
	purpose: "forget-password" | "sign-in";
	locale?: "en" | "de";
}) {
	const opts = { locale };
	const reset = purpose === "forget-password";
	const preview = reset
		? m.email_otp_preview_reset({ brand: brandName }, opts)
		: m.email_otp_preview_signin({ brand: brandName }, opts);
	const heading = reset
		? m.email_otp_heading_reset({}, opts)
		: m.email_otp_heading_signin({}, opts);

	return (
		<Html lang={locale ?? "en"}>
			<Head />
			<Preview>{preview}</Preview>
			<Body style={s.main}>
				<Container style={s.container}>
					<Text style={s.wordmark}>{brandName}</Text>
					<Heading style={s.heading}>{heading}</Heading>
					<Text style={s.text}>{m.email_otp_body({}, opts)}</Text>
					<Text style={s.otpCode}>{otp}</Text>
					<Hr style={s.hr} />
					<Text style={s.footer}>
						{m.email_otp_footer({ brand: brandName }, opts)}
					</Text>
				</Container>
			</Body>
		</Html>
	);
}

PasswordOtpEmail.PreviewProps = {
	otp: "123456",
	brandName: "Starter",
	purpose: "sign-in" as const,
};

export default PasswordOtpEmail;
