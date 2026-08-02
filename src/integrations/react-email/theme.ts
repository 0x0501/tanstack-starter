// Shared email styles. Email clients need inline styles and web-safe fonts.
// Neutral structural palette only — clones rebrand for product identity.
export const serif = "Georgia, 'Times New Roman', Times, serif";

export const main = {
	backgroundColor: "#f4f4f5",
	margin: 0,
	// Horizontal padding keeps the card off the screen edges on small devices.
	padding: "32px 16px",
	fontFamily: serif,
};
export const container = {
	maxWidth: "480px",
	margin: "0 auto",
	backgroundColor: "#ffffff",
	border: "1px solid #e4e4e7",
	borderRadius: "4px",
	padding: "40px 40px 32px",
};
export const wordmark = {
	margin: 0,
	fontFamily: serif,
	fontSize: "22px",
	fontWeight: 600,
	letterSpacing: "0.01em",
	color: "#18181b",
};
export const heading = {
	margin: "24px 0 0",
	fontFamily: serif,
	fontSize: "26px",
	fontWeight: 600,
	color: "#18181b",
};
export const text = {
	margin: "12px 0 0",
	fontSize: "16px",
	lineHeight: "1.6",
	color: "#52525b",
};
export const button = {
	backgroundColor: "#18181b",
	color: "#fafafa",
	fontFamily: serif,
	fontSize: "16px",
	fontWeight: 600,
	textDecoration: "none",
	padding: "12px 28px",
	borderRadius: "3px",
	display: "inline-block",
};
export const linkText = {
	margin: "8px 0 0",
	fontSize: "13px",
	lineHeight: "1.5",
	color: "#3f3f46",
	wordBreak: "break-all" as const,
};
export const hr = { borderColor: "#e4e4e7", margin: "28px 0 0" };
export const footer = {
	margin: "16px 0 0",
	fontSize: "13px",
	lineHeight: "1.6",
	color: "#71717a",
};
export const otpCode = {
	margin: "20px 0 0",
	fontFamily:
		"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
	fontSize: "28px",
	fontWeight: 600,
	letterSpacing: "0.2em",
	color: "#18181b",
	textAlign: "center" as const,
};
