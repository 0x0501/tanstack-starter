export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "theme";

export function readThemePreference(): ThemePreference {
	if (typeof window === "undefined") return "system";
	try {
		const raw = localStorage.getItem(THEME_STORAGE_KEY);
		if (raw === "light" || raw === "dark" || raw === "system") return raw;
		// Legacy: older script stored only light|dark; treat missing as system.
		if (raw === null) return "system";
	} catch {
		// ignore
	}
	return "system";
}

export function resolveDark(preference: ThemePreference): boolean {
	if (preference === "dark") return true;
	if (preference === "light") return false;
	if (typeof window === "undefined") return false;
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Apply theme to <html> and persist preference. */
export function applyTheme(preference: ThemePreference): void {
	if (typeof document === "undefined") return;
	const dark = resolveDark(preference);
	document.documentElement.classList.toggle("dark", dark);
	document.documentElement.dataset.theme = preference;
	try {
		if (preference === "system") {
			localStorage.removeItem(THEME_STORAGE_KEY);
		} else {
			localStorage.setItem(THEME_STORAGE_KEY, preference);
		}
	} catch {
		// ignore quota / private mode
	}
}

/** Inline FOUC-prevention script for document head. */
export const THEME_INIT_SCRIPT =
	"try{var k='theme';var t=localStorage.getItem(k);var d=t==='dark'||((t!=='light')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.dataset.theme=t==='light'||t==='dark'?t:'system'}catch(e){}";
