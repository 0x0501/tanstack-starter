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

/** See `VerifyEmail` for why `locale` is a prop rather than ambient state. */
export function ResetPasswordEmail({
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
			<Preview>{m.email_reset_preview({ brand: brandName }, opts)}</Preview>
			<Body style={s.main}>
				<Container style={s.container}>
					<Text style={s.wordmark}>{brandName}</Text>
					<Heading style={s.heading}>{m.email_reset_heading({}, opts)}</Heading>
					<Text style={s.text}>
						{name
							? m.email_reset_body_named({ name, brand: brandName }, opts)
							: m.email_reset_body({ brand: brandName }, opts)}
					</Text>
					<Section style={{ textAlign: "center", margin: "32px 0 4px" }}>
						<Button href={url} style={s.button}>
							{m.email_reset_cta({}, opts)}
						</Button>
					</Section>
					<Text style={s.text}>{m.email_link_fallback({}, opts)}</Text>
					<Text style={s.linkText}>{url}</Text>
					<Hr style={s.hr} />
					<Text style={s.footer}>{m.email_reset_footer({}, opts)}</Text>
				</Container>
			</Body>
		</Html>
	);
}

ResetPasswordEmail.PreviewProps = {
	url: "https://example.com/reset-password?token=preview-token",
	name: "Ada",
	brandName: "Starter",
};

export default ResetPasswordEmail;
