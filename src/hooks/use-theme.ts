import { useEffect, useState } from "react";
import {
	applyTheme,
	readThemePreference,
	type ThemePreference,
} from "@/lib/theme";

/** Theme behavior shared by the supplied control and custom presentations. */
export function useTheme() {
	const [preference, setPreference] = useState<ThemePreference>("system");
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setPreference(readThemePreference());
		setMounted(true);
	}, []);

	useEffect(() => {
		if (!mounted || preference !== "system") return;
		const query = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyTheme("system");
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, [mounted, preference]);

	function setTheme(next: ThemePreference) {
		setPreference(next);
		applyTheme(next);
	}

	return { preference, setTheme, mounted };
}
