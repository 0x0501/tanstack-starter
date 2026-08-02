import { TanStackDevtools } from "@tanstack/react-devtools";
import { HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { ReactNode } from "react";
import TanStackQueryDevtools from "@/integrations/tanstack-query/devtools";
import { getLocale } from "@/paraglide/runtime";

export function RootDocument({ children }: { children: ReactNode }) {
	const locale = getLocale();

	return (
		<html lang={locale} suppressHydrationWarning>
			<head>
				<HeadContent />
			</head>
			<body>
				{/* Base UI portal stacking root — isolation: isolate (styles.css .root) */}
				<div className="root" id="app">
					<main className="flex flex-1 flex-col">{children}</main>
				</div>
				{import.meta.env.DEV ? (
					<TanStackDevtools
						config={{ position: "bottom-right" }}
						plugins={[
							{
								name: "Tanstack Router",
								render: <TanStackRouterDevtoolsPanel />,
							},
							TanStackQueryDevtools,
						]}
					/>
				) : null}
				<Scripts />
			</body>
		</html>
	);
}
