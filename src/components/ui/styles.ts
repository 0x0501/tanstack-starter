/**
 * Structural utility classes for forms/shells (layout, border, focus ring).
 * Not a second design system — black/white neutrals only; clones re-skin via CSS variables.
 */

const fieldControlClass =
	"flex h-9 w-full rounded border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export const buttonPrimaryClass =
	"inline-flex h-9 items-center justify-center rounded bg-primary px-3 text-sm font-medium text-primary-foreground outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export const buttonSecondaryClass =
	"inline-flex h-9 items-center justify-center rounded border border-border bg-background px-3 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export const buttonGhostClass =
	"inline-flex h-9 items-center justify-center rounded px-3 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export const buttonDestructiveClass =
	"inline-flex h-9 items-center justify-center rounded bg-destructive px-3 text-sm font-medium text-destructive-foreground outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export const cardClass = "border border-border bg-card text-card-foreground";

export const labelClass = "mb-1 block text-sm text-foreground";

export const mutedTextClass = "text-sm text-muted-foreground";

export const linkClass = "underline underline-offset-2 hover:opacity-80";

export const buttonClass = `${buttonPrimaryClass} w-full`;

export const inputClass = fieldControlClass;
