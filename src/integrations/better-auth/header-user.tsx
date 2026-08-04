import { authClient } from "@/lib/auth-client";

export default function BetterAuthHeader() {
	const { data: session, isPending } = authClient.useSession();

	if (isPending) {
		return <div className="h-8 w-8 bg-muted animate-pulse" />;
	}

	if (session?.user) {
		return (
			<div className="flex items-center gap-2">
				{session.user.image ? (
					<img src={session.user.image} alt="" className="h-8 w-8" />
				) : (
					<div className="h-8 w-8 bg-muted flex items-center justify-center">
						<span className="text-xs font-medium text-muted-foreground">
							{session.user.name?.charAt(0).toUpperCase() || "U"}
						</span>
					</div>
				)}
				<button
					type="button"
					onClick={() => {
						void authClient.signOut();
					}}
					className="flex-1 h-9 px-4 text-sm font-medium bg-background text-muted-foreground border border-border hover:bg-muted dark:hover:bg-muted transition-colors"
				>
					Sign out
				</button>
			</div>
		);
	}

	return null;
}
