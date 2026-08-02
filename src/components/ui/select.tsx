import { Select as BaseSelect } from "@base-ui/react/select";
import type { ComponentProps } from "react";
import { mergeClassName } from "@/utils/cn";

const triggerClass =
	"flex h-9 w-full items-center justify-between gap-2 rounded border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-[disabled]:opacity-50";

const popupClass =
	"z-50 max-h-60 min-w-[var(--anchor-width)] overflow-auto rounded border border-border bg-background py-1 text-foreground outline-none";

const itemClass =
	"cursor-pointer px-3 py-1.5 text-sm outline-none data-[highlighted]:bg-muted data-[selected]:font-medium data-[disabled]:opacity-50";

export function Select(props: ComponentProps<typeof BaseSelect.Root>) {
	return <BaseSelect.Root {...props} />;
}

export function SelectTrigger({
	className,
	...props
}: ComponentProps<typeof BaseSelect.Trigger>) {
	return (
		<BaseSelect.Trigger
			className={mergeClassName(triggerClass, className)}
			{...props}
		/>
	);
}

export function SelectValue(props: ComponentProps<typeof BaseSelect.Value>) {
	return <BaseSelect.Value {...props} />;
}

export function SelectIcon({
	className,
	children,
	...props
}: ComponentProps<typeof BaseSelect.Icon>) {
	return (
		<BaseSelect.Icon
			className={mergeClassName("text-muted-foreground", className)}
			{...props}
		>
			{children ?? <span aria-hidden>▾</span>}
		</BaseSelect.Icon>
	);
}

export function SelectPortal(props: ComponentProps<typeof BaseSelect.Portal>) {
	return <BaseSelect.Portal {...props} />;
}

export function SelectPositioner(
	props: ComponentProps<typeof BaseSelect.Positioner>,
) {
	return <BaseSelect.Positioner sideOffset={4} {...props} />;
}

export function SelectPopup({
	className,
	...props
}: ComponentProps<typeof BaseSelect.Popup>) {
	return (
		<BaseSelect.Popup
			className={mergeClassName(popupClass, className)}
			{...props}
		/>
	);
}

export function SelectItem({
	className,
	...props
}: ComponentProps<typeof BaseSelect.Item>) {
	return (
		<BaseSelect.Item
			className={mergeClassName(itemClass, className)}
			{...props}
		/>
	);
}

export function SelectItemText(
	props: ComponentProps<typeof BaseSelect.ItemText>,
) {
	return <BaseSelect.ItemText {...props} />;
}
