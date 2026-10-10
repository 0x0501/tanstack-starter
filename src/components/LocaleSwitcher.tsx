import { Menu } from "@base-ui/react/menu";
import { useLocation } from "@tanstack/react-router";
import { LOCALE_COOKIE, writeLocaleCookie } from "@/lib/locale-cookie";
import * as m from "@/paraglide/messages";
import { getLocale, locales } from "@/paraglide/runtime";
import { cn } from "@/utils/cn";
import { samePageLocaleHref } from "@/utils/same-page-locale-href";

const LABEL: Record<string, () => string> = {
	en: () => m.locale_en(),
	de: () => m.locale_de(),
};

/**
 * Language switcher: menu of real same-page localized anchors (path, query,
 * hash preserved) plus a locale cookie write. Primary control is not a button
 * that only calls setLocale.
 */
export function LocaleSwitcher({
	variant = "button",
}: {
	variant?: "button" | "bare";
} = {}) {
	const location = useLocation();
	const current = getLocale();
	const bare = variant === "bare";

	return (
		<Menu.Root>
			<Menu.Trigger
				aria-label={m.language_label()}
				data-testid="locale-switcher"
				className={cn(
					"ui-locale-trigger",
					!bare && "ui-locale-trigger--button",
				)}
			>
				<span className="font-medium uppercase">{current}</span>
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Positioner
					side="bottom"
					align="end"
					sideOffset={6}
					className="ui-positioner"
				>
					<Menu.Popup
						className="ui-menu-popup"
						data-testid="locale-switcher-menu"
					>
						{locales.map((locale) => (
							<Menu.LinkItem
								key={locale}
								href={samePageLocaleHref({
									pathname: location.pathname,
									search: location.searchStr,
									hash: location.hash ? `#${location.hash}` : "",
									locale,
								})}
								hrefLang={locale}
								aria-current={locale === current ? "true" : undefined}
								onClick={() => {
									writeLocaleCookie(locale);
								}}
								className="ui-menu-item"
								data-testid={`locale-link-${locale}`}
								data-locale-cookie={LOCALE_COOKIE}
							>
								{LABEL[locale]?.() ?? locale}
							</Menu.LinkItem>
						))}
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	);
}

export default LocaleSwitcher;
