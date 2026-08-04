import { Link } from "@tanstack/react-router";
import { buttonPrimaryClass, mutedTextClass } from "@/components/ui/styles";
import * as m from "@/paraglide/messages";

export function NotFound() {
	return (
		<div className="page py-24 text-center">
			<p className="text-5xl text-muted-foreground">404</p>
			<h1 className="mt-3 text-xl font-medium">{m.common_not_found()}</h1>
			<p className={`mt-2 ${mutedTextClass}`}>
				The page you are looking for does not exist or has moved.
			</p>
			<div className="mt-8 flex justify-center">
				<Link to="/" className={buttonPrimaryClass}>
					{m.nav_home()}
				</Link>
			</div>
		</div>
	);
}
