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

import * as m from "@/paraglide/messages";
import * as s from "./theme.ts";

/**
 * `locale` is passed explicitly rather than read from ambient state: an email
 * is rendered inside a request whose own locale is the sender's, not the
 * recipient's. It is the account's stored `user.locale` (ADR 0005).
 */
export function VerifyEmail({
	url,
	name,
	brandName,
	locale,
}: {
	url: string;
	name?: string;
	brandName: string;
	locale?: "en" | "de";
}) {
	const opts = { locale };
	return (
		<Html lang={locale ?? "en"}>
			<Head />
			<Preview>{m.email_verify_preview({ brand: brandName }, opts)}</Preview>
			<Body style={s.main}>
				<Container style={s.container}>
					<Text style={s.wordmark}>{brandName}</Text>
					<Heading style={s.heading}>
						{m.email_verify_heading({}, opts)}
					</Heading>
					<Text style={s.text}>
						{name
							? m.email_verify_body_named({ name }, opts)
							: m.email_verify_body({}, opts)}
					</Text>
					<Section style={{ textAlign: "center", margin: "32px 0 4px" }}>
						<Button href={url} style={s.button}>
							{m.email_verify_cta({}, opts)}
						</Button>
					</Section>
					<Text style={s.text}>{m.email_link_fallback({}, opts)}</Text>
					<Text style={s.linkText}>{url}</Text>
					<Hr style={s.hr} />
					<Text style={s.footer}>
						{m.email_verify_footer({ brand: brandName }, opts)}
					</Text>
				</Container>
			</Body>
		</Html>
	);
}

VerifyEmail.PreviewProps = {
	url: "https://example.com/api/auth/verify-email?token=preview-token",
	name: "Ada",
	brandName: "Starter",
};

export default VerifyEmail;
