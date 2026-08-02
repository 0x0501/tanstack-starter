import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import type { ComponentProps } from "react";
import { mergeClassName } from "@/utils/cn";

const rootClass =
	"flex size-4 shrink-0 items-center justify-center rounded border border-input bg-background text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-[checked]:border-primary data-[checked]:bg-primary data-[disabled]:opacity-50";

export function Checkbox({
	className,
	...props
}: ComponentProps<typeof BaseCheckbox.Root>) {
	return (
		<BaseCheckbox.Root
			className={mergeClassName(rootClass, className)}
			{...props}
		>
			<BaseCheckbox.Indicator className="text-[10px] leading-none">
				<span aria-hidden>✓</span>
			</BaseCheckbox.Indicator>
		</BaseCheckbox.Root>
	);
}
