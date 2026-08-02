import { Link } from "@tanstack/react-router";
import {
	buttonPrimaryClass,
	buttonSecondaryClass,
	mutedTextClass,
} from "@/components/ui/styles";
import * as m from "@/paraglide/messages";

export function RootError({
	error,
	reset,
}: {
	error: Error;
	reset: () => void;
}) {
	const message =
		error instanceof Error ? error.message : "Something went wrong.";

	return (
		<div className="page py-24 text-center">
			<p className="text-sm text-destructive">Error</p>
			<h1 className="mt-2 text-xl font-medium">Something went wrong</h1>
			<p className={`mt-2 ${mutedTextClass}`}>{message}</p>
			<div className="mt-8 flex flex-wrap justify-center gap-2">
				<button type="button" className={buttonPrimaryClass} onClick={reset}>
					Try again
				</button>
				<Link to="/" className={buttonSecondaryClass}>
					{m.nav_home()}
				</Link>
			</div>
		</div>
	);
}
