import {
	Body,
	Button,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Preview,
	Section,
	Text,
} from "@react-email/components";

import * as s from "./theme.ts";

export function ResetPasswordEmail({
	url,
	name,
}: {
	url: string;
	name?: string;
}) {
	return (
		<Html>
			<Head />
			<Preview>Reset your Privsnap password</Preview>
			<Body style={s.main}>
				<Container style={s.container}>
					<Text style={s.wordmark}>Privsnap</Text>
					<Heading style={s.heading}>Reset your password</Heading>
					<Text style={s.text}>
						{name ? `Hello, ${name}. ` : "Hello. "}
						We received a request to reset your Privsnap password. Choose a new
						one with the button below. This link expires in one hour.
					</Text>
					<Section style={{ textAlign: "center", margin: "32px 0 4px" }}>
						<Button href={url} style={s.button}>
							Reset password
						</Button>
					</Section>
					<Text style={s.text}>
						If the button does not work, paste this link into your browser:
					</Text>
					<Text style={s.linkText}>{url}</Text>
					<Hr style={s.hr} />
					<Text style={s.footer}>
						If you did not request a password reset, you can safely ignore this
						email; your password will not change.
					</Text>
				</Container>
			</Body>
		</Html>
	);
}

ResetPasswordEmail.PreviewProps = {
	url: "https://privsnap.app/reset-password?token=preview-token",
	name: "Ada",
};

export default ResetPasswordEmail;
