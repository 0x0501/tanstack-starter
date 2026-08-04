import { createFileRoute, Link } from "@tanstack/react-router";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
	buttonPrimaryClass,
	buttonSecondaryClass,
	linkClass,
	mutedTextClass,
} from "@/components/ui/styles";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, SITE_NAME } from "@/lib/site";
import * as m from "@/paraglide/messages";
import { cn } from "@/utils/cn";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: DEFAULT_TITLE },
			{ name: "description", content: DEFAULT_DESCRIPTION },
			{ property: "og:title", content: DEFAULT_TITLE },
			{ property: "og:description", content: DEFAULT_DESCRIPTION },
			{ name: "twitter:title", content: DEFAULT_TITLE },
			{ name: "twitter:description", content: DEFAULT_DESCRIPTION },
			{ name: "application-name", content: SITE_NAME },
		],
	}),
	component: Home,
});

function Home() {
	return (
		<div className="page" data-testid="home-page">
			<header className="mb-10 flex flex-wrap items-center justify-between gap-3">
				<p className="text-sm text-muted-foreground" data-testid="home-eyebrow">
					{m.app_name()}
				</p>
				<div className="flex flex-wrap items-center gap-3">
					<LocaleSwitcher />
					<ThemeToggle />
				</div>
			</header>

			<section data-testid="home-hero">
				<h1
					className="text-2xl font-medium tracking-tight text-foreground sm:text-3xl"
					data-testid="home-title"
				>
					{m.home_tagline()}
				</h1>
				<p
					className={cn(mutedTextClass, "mt-3 max-w-prose leading-relaxed")}
					data-testid="home-blurb"
				>
					{m.home_blurb()}
				</p>

				<nav
					className="mt-8 flex flex-wrap items-center gap-3"
					aria-label={m.nav_primary()}
					data-testid="home-nav"
				>
					<Link
						to="/sign-in"
						className={buttonPrimaryClass}
						data-testid="nav-sign-in"
					>
						{m.nav_sign_in()}
					</Link>
					<Link
						to="/sign-up"
						className={buttonSecondaryClass}
						data-testid="nav-sign-up"
					>
						{m.nav_sign_up()}
					</Link>
					<Link to="/dashboard" className={linkClass}>
						{m.nav_dashboard()}
					</Link>
					<Link to="/admin/users" className={linkClass}>
						{m.nav_admin()}
					</Link>
				</nav>
			</section>
		</div>
	);
}
