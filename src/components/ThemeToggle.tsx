import { useEffect, useState } from "react";
import {
	applyTheme,
	readThemePreference,
	type ThemePreference,
} from "@/lib/theme";
import * as m from "@/paraglide/messages";
import { cn } from "@/utils/cn";

const OPTIONS: ThemePreference[] = ["light", "dark", "system"];

function labelFor(option: ThemePreference): string {
	switch (option) {
		case "light":
			return m.theme_light();
		case "dark":
			return m.theme_dark();
		default:
			return m.theme_system();
	}
}

/** Minimal Light / Dark / System control. */
export function ThemeToggle({ className }: { className?: string }) {
	const [preference, setPreference] = useState<ThemePreference>("system");
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setPreference(readThemePreference());
		setMounted(true);
	}, []);

	useEffect(() => {
		if (!mounted || preference !== "system") return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyTheme("system");
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [mounted, preference]);

	return (
		<fieldset
			className={cn("m-0 inline-flex gap-1 border-0 p-0", className)}
			data-testid="theme-toggle"
		>
			<legend className="sr-only">{m.theme_label()}</legend>
			{OPTIONS.map((option) => {
				const active = mounted ? preference === option : option === "system";
				return (
					<button
						key={option}
						type="button"
						data-testid={`theme-${option}`}
						data-active={active ? "true" : "false"}
						aria-pressed={active}
						onClick={() => {
							setPreference(option);
							applyTheme(option);
						}}
						className={cn(
							"h-8 rounded px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
							active
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{labelFor(option)}
					</button>
				);
			})}
		</fieldset>
	);
}
