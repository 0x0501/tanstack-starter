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

export function VerifyEmail({ url, name }: { url: string; name?: string }) {
	return (
		<Html>
			<Head />
			<Preview>Confirm your email to start using Privsnap</Preview>
			<Body style={s.main}>
				<Container style={s.container}>
					<Text style={s.wordmark}>Privsnap</Text>
					<Heading style={s.heading}>Confirm your email</Heading>
					<Text style={s.text}>
						{name ? `Welcome, ${name}. ` : "Welcome. "}
						Confirm this address to finish setting up your account and start
						reading text from images and PDFs, privately in your browser.
					</Text>
					<Section style={{ textAlign: "center", margin: "32px 0 4px" }}>
						<Button href={url} style={s.button}>
							Verify email
						</Button>
					</Section>
					<Text style={s.text}>
						If the button does not work, paste this link into your browser:
					</Text>
					<Text style={s.linkText}>{url}</Text>
					<Hr style={s.hr} />
					<Text style={s.footer}>
						You received this because someone signed up for Privsnap with this
						address. If that was not you, you can safely ignore this email.
					</Text>
				</Container>
			</Body>
		</Html>
	);
}

VerifyEmail.PreviewProps = {
	url: "https://privsnap.app/api/auth/verify-email?token=preview-token",
	name: "Ada",
};

export default VerifyEmail;
