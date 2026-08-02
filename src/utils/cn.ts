type ClassPart = string | false | null | undefined;

/** Join class names, skipping falsy values. */
export function cn(...parts: ClassPart[]): string {
	return parts.filter(Boolean).join(" ");
}

/**
 * Merge a static base class with a Base UI className prop
 * (string or state-derived function).
 */
export function mergeClassName<S>(
	base: string,
	className?: string | ((state: S) => string | undefined),
): string | ((state: S) => string) {
	if (typeof className === "function") {
		return (state: S) => cn(base, className(state));
	}
	return cn(base, className);
}
