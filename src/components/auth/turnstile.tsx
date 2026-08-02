import {
	type TurnstileInstance,
	Turnstile as TurnstileWidget,
} from "@marsidev/react-turnstile";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { CAPTCHA_ENABLED, TURNSTILE_SITE_KEY } from "@/lib/captcha";

export type TurnstileHandle = { reset: () => void };

/** The site's current dark-mode state: the `.dark` class the theme toggle sets
 * on `<html>` (SSR-safe — reports "light" before the DOM exists). */
const readSiteTheme = (): "light" | "dark" =>
	typeof document !== "undefined" &&
	document.documentElement.classList.contains("dark")
		? "dark"
		: "light";

function useSiteTheme(): "light" | "dark" {
	const [theme, setTheme] = useState<"light" | "dark">(readSiteTheme);
	useEffect(() => {
		const root = document.documentElement;
		const sync = () => setTheme(readSiteTheme());
		const observer = new MutationObserver(sync);
		observer.observe(root, { attributes: true, attributeFilter: ["class"] });
		sync();
		return () => observer.disconnect();
	}, []);
	return theme;
}

/**
 * Cloudflare Turnstile widget. Renders only when CAPTCHA_ENABLED (production
 * with a site key). Call `reset()` after each submit — tokens are single-use.
 */
export const Turnstile = forwardRef<
	TurnstileHandle,
	{ onToken: (token: string | null) => void }
>(function Turnstile({ onToken }, ref) {
	const widget = useRef<TurnstileInstance>(undefined);
	const theme = useSiteTheme();

	useImperativeHandle(ref, () => ({
		reset() {
			widget.current?.reset();
			onToken(null);
		},
	}));

	if (!CAPTCHA_ENABLED) return null;
	return (
		<TurnstileWidget
			ref={widget}
			siteKey={TURNSTILE_SITE_KEY as string}
			onSuccess={(token) => onToken(token)}
			onError={() => onToken(null)}
			onExpire={() => onToken(null)}
			options={{ theme }}
			className="mt-1"
		/>
	);
});
