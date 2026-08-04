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
					"inline-flex h-8 items-center gap-1 rounded px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
					bare
						? "text-muted-foreground hover:text-foreground"
						: "border border-border text-foreground hover:bg-muted",
				)}
			>
				<span className="font-medium uppercase">{current}</span>
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Positioner
					side="bottom"
					align="end"
					sideOffset={6}
					className="z-50"
				>
					<Menu.Popup
						className="min-w-[9rem] overflow-hidden rounded border border-border bg-background py-1 text-foreground outline-none shadow-sm"
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
								className={cn(
									"block px-3 py-1.5 text-sm outline-none data-highlighted:bg-muted",
									locale === current && "font-medium",
								)}
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
