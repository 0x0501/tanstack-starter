import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ComponentProps } from "react";
import { mergeClassName } from "@/utils/cn";

const listClass = "mb-4 flex gap-4 border-b border-border";

// Base UI Tabs expose `data-active` (not Select's `data-selected`).
const tabClass =
	"relative -mb-px border-b-2 border-transparent pb-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:border-foreground data-active:text-foreground data-disabled:opacity-50";

const panelClass = "outline-none";

export function Tabs(props: ComponentProps<typeof BaseTabs.Root>) {
	return <BaseTabs.Root {...props} />;
}

export function TabsList({
	className,
	...props
}: ComponentProps<typeof BaseTabs.List>) {
	return (
		<BaseTabs.List
			className={mergeClassName(listClass, className)}
			{...props}
		/>
	);
}

export function TabsTab({
	className,
	...props
}: ComponentProps<typeof BaseTabs.Tab>) {
	return (
		<BaseTabs.Tab className={mergeClassName(tabClass, className)} {...props} />
	);
}

export function TabsPanel({
	className,
	...props
}: ComponentProps<typeof BaseTabs.Panel>) {
	return (
		<BaseTabs.Panel
			className={mergeClassName(panelClass, className)}
			{...props}
		/>
	);
}
