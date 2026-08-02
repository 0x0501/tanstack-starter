import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
	AdminShell,
	buttonClass,
	Field,
	inputClass,
} from "@/components/shells";
import * as m from "@/paraglide/messages";
import {
	createOAuthClient,
	deleteOAuthClient,
	getOAuthClients,
} from "@/server/oauth-clients";

export const Route = createFileRoute("/admin/oauth-apps")({
	component: AdminOAuthAppsPage,
});

function AdminOAuthAppsPage() {
	const qc = useQueryClient();
	const [name, setName] = useState("");
	const [redirectUris, setRedirectUris] = useState(
		"http://127.0.0.1:38256/oauth/callback",
	);
	const [createdSecret, setCreatedSecret] = useState<string | null>(null);

	const { data, isLoading, error } = useQuery({
		queryKey: ["oauth-clients"],
		queryFn: () => getOAuthClients(),
	});

	const createMut = useMutation({
		mutationFn: () =>
			createOAuthClient({
				data: {
					clientName: name,
					redirectUris: redirectUris
						.split(/[\n,]+/)
						.map((s) => s.trim())
						.filter(Boolean),
					publicClient: false,
				},
			}),
		onSuccess: (res) => {
			setCreatedSecret(res.clientSecret);
			setName("");
			void qc.invalidateQueries({ queryKey: ["oauth-clients"] });
		},
	});

	const deleteMut = useMutation({
		mutationFn: (clientId: string) => deleteOAuthClient({ data: { clientId } }),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: ["oauth-clients"] });
		},
	});

	return (
		<AdminShell title={m.admin_oauth_title()}>
			<section className="mb-10 max-w-lg">
				<h2 className="mb-3 text-lg font-medium">Create client</h2>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						createMut.mutate();
					}}
				>
					<Field label="Name">
						<input
							className={inputClass}
							required
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</Field>
					<Field label="Redirect URIs (one per line)">
						<textarea
							className={inputClass}
							rows={3}
							required
							value={redirectUris}
							onChange={(e) => setRedirectUris(e.target.value)}
						/>
					</Field>
					<button
						type="submit"
						className={`${buttonClass} max-w-xs`}
						disabled={createMut.isPending}
					>
						{createMut.isPending ? "Creating…" : "Create"}
					</button>
				</form>
				{createdSecret ? (
					<p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
						Client secret (copy now):{" "}
						<code className="break-all">{createdSecret}</code>
					</p>
				) : null}
				{createMut.error ? (
					<p className="mt-2 text-sm text-red-600" role="alert">
						{(createMut.error as Error).message}
					</p>
				) : null}
			</section>

			<section>
				<h2 className="mb-3 text-lg font-medium">Registered clients</h2>
				{isLoading ? (
					<p className="text-sm text-neutral-500">Loading…</p>
				) : null}
				{error ? (
					<p className="text-sm text-red-600" role="alert">
						{(error as Error).message}
					</p>
				) : null}
				{data && data.length === 0 ? (
					<p className="text-sm text-neutral-600">No OAuth clients yet.</p>
				) : null}
				{data && data.length > 0 ? (
					<ul className="space-y-3">
						{data.map((c) => (
							<li
								key={c.clientId}
								className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800"
							>
								<div className="flex flex-wrap items-start justify-between gap-2">
									<div>
										<p className="font-medium">{c.name ?? "(unnamed)"}</p>
										<p className="font-mono text-xs text-neutral-500">
											{c.clientId}
										</p>
										<p className="mt-1 text-xs text-neutral-600">
											{c.redirectUris.join(", ")}
										</p>
									</div>
									<button
										type="button"
										className={`${buttonClass} w-auto bg-red-800 px-3 py-1 text-xs dark:bg-red-200`}
										disabled={deleteMut.isPending}
										onClick={() => deleteMut.mutate(c.clientId)}
									>
										Delete
									</button>
								</div>
							</li>
						))}
					</ul>
				) : null}
			</section>
		</AdminShell>
	);
}
