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

import * as s from "./theme.ts";

export function PasswordOtpEmail({
	otp,
	brandName,
	purpose,
}: {
	otp: string;
	brandName: string;
	purpose: "forget-password" | "sign-in";
}) {
	const preview =
		purpose === "forget-password"
			? `Your ${brandName} password reset code`
			: `Your ${brandName} sign-in code`;
	const heading =
		purpose === "forget-password" ? "Password reset code" : "Sign-in code";

	return (
		<Html>
			<Head />
			<Preview>{preview}</Preview>
			<Body style={s.main}>
				<Container style={s.container}>
					<Text style={s.wordmark}>{brandName}</Text>
					<Heading style={s.heading}>{heading}</Heading>
					<Text style={s.text}>
						Use this one-time code. It expires shortly. Do not share it.
					</Text>
					<Text style={s.otpCode}>{otp}</Text>
					<Hr style={s.hr} />
					<Text style={s.footer}>
						You received this because someone used this address with {brandName}
						. If that was not you, you can ignore this email.
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
