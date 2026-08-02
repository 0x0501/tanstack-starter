import { deLocalizeHref, type Locale, localizeHref } from "@/paraglide/runtime";

/**
 * Build a same-page language-switch href: localize the path, keep search and
 * hash byte-for-byte. Pure over the compiled Paraglide runtime.
 */
export function samePageLocaleHref(input: {
	pathname: string;
	/** Including leading "?", or "". */
	search?: string;
	/** Including leading "#", or "". */
	hash?: string;
	locale: Locale;
}): string {
	const search = input.search ?? "";
	const hash = input.hash ?? "";
	const canonical = deLocalizeHref(input.pathname);
	const path = localizeHref(canonical, { locale: input.locale });
	return `${path}${search}${hash}`;
}
