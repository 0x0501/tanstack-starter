import { useTheme } from "@/hooks/use-theme";
import type { ThemePreference } from "@/lib/theme";
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

/** Default presentation of the Headless theme behavior. */
export function ThemeToggle({ className }: { className?: string }) {
	const { preference, setTheme, mounted } = useTheme();

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
						onClick={() => setTheme(option)}
						className="ui-theme-option"
					>
						{labelFor(option)}
					</button>
				);
			})}
		</fieldset>
	);
}
