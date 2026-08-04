import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdminShell, buttonClass, inputClass } from "@/components/shells";
import { Checkbox } from "@/components/ui/checkbox";
import * as m from "@/paraglide/messages";
import { getUsers, updateUser } from "@/server/admin-users";
import {
	getPaymentMethodToggles,
	updatePaymentMethodToggles,
} from "@/server/payment-toggles";

export const Route = createFileRoute("/admin/users")({
	component: AdminUsersPage,
});

function AdminUsersPage() {
	const qc = useQueryClient();
	const [search, setSearch] = useState("");
	const { data, isLoading, error } = useQuery({
		queryKey: ["admin-users", search],
		queryFn: () =>
			getUsers({
				data: {
					page: 0,
					pageSize: 50,
					search,
					filters: {},
				},
			}),
	});

	const toggles = useQuery({
		queryKey: ["payment-toggles"],
		queryFn: () => getPaymentMethodToggles(),
	});

	const mutation = useMutation({
		mutationFn: (input: {
			userId: string;
			emailVerified: boolean;
			banned: boolean;
			role?: "user" | "admin";
		}) => updateUser({ data: input }),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: ["admin-users"] });
		},
	});

	const toggleMut = useMutation({
		mutationFn: (next: {
			stripe: boolean;
			creem: boolean;
			nowpayments: boolean;
		}) => updatePaymentMethodToggles({ data: next }),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: ["payment-toggles"] });
		},
	});

	return (
		<AdminShell title={m.admin_users_title()}>
			{toggles.data ? (
				<section className="mb-6 border border-border p-4 text-sm">
					<p className="mb-2 font-medium">{m.admin_payment_toggles()}</p>
					<div className="flex flex-wrap gap-4">
						{(["stripe", "creem", "nowpayments"] as const).map((key) => (
							<div key={key} className="inline-flex items-center gap-2">
								<Checkbox
									id={`pay-toggle-${key}`}
									checked={toggles.data[key]}
									disabled={toggleMut.isPending}
									onCheckedChange={(checked) =>
										toggleMut.mutate({
											...toggles.data,
											[key]: checked === true,
										})
									}
								/>
								<label htmlFor={`pay-toggle-${key}`}>{key}</label>
							</div>
						))}
					</div>
					<p className="mt-1 text-xs text-muted-foreground">
						{m.admin_payment_toggles_hint()}
					</p>
				</section>
			) : null}
			<div className="mb-4 flex flex-wrap gap-2">
				<input
					className={`${inputClass} max-w-xs`}
					placeholder={m.admin_users_search_placeholder()}
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
			</div>
			{isLoading ? (
				<p className="text-sm text-muted-foreground">{m.common_loading()}</p>
			) : null}
			{error ? (
				<p className="text-sm text-destructive" role="alert">
					{(error as Error).message}
				</p>
			) : null}
			{data ? (
				<div className="overflow-x-auto border border-border">
					<table className="w-full min-w-[40rem] text-left text-sm">
						<thead>
							<tr className="border-b border-border">
								<th className="px-3 py-2 font-medium">{m.admin_col_email()}</th>
								<th className="px-3 py-2 font-medium">{m.admin_col_name()}</th>
								<th className="px-3 py-2 font-medium">{m.admin_col_role()}</th>
								<th className="px-3 py-2 font-medium">
									{m.admin_col_status()}
								</th>
								<th className="px-3 py-2 font-medium">
									{m.admin_col_actions()}
								</th>
							</tr>
						</thead>
						<tbody>
							{data.rows.map((row) => (
								<tr
									key={row.id}
									className="border-b border-border last:border-0"
								>
									<td className="px-3 py-2">{row.email}</td>
									<td className="px-3 py-2">{row.name}</td>
									<td className="px-3 py-2">{row.role ?? "user"}</td>
									<td className="px-3 py-2">
										{row.banned ? "banned" : "active"}
										{row.emailVerified ? "" : " · unverified"}
									</td>
									<td className="px-3 py-2">
										<div className="flex flex-wrap gap-2">
											{row.role !== "superadmin" && row.role !== "admin" ? (
												<button
													type="button"
													className={`${buttonClass} h-8 w-auto px-2 text-xs`}
													disabled={mutation.isPending}
													onClick={() =>
														mutation.mutate({
															userId: row.id,
															emailVerified: Boolean(row.emailVerified),
															banned: !row.banned,
														})
													}
												>
													{row.banned ? "Unban" : "Ban"}
												</button>
											) : null}
											{row.role === "user" ? (
												<button
													type="button"
													className={`${buttonClass} h-8 w-auto px-2 text-xs`}
													disabled={mutation.isPending}
													onClick={() =>
														mutation.mutate({
															userId: row.id,
															emailVerified: Boolean(row.emailVerified),
															banned: Boolean(row.banned),
															role: "admin",
														})
													}
												>
													Make admin
												</button>
											) : null}
											{row.role === "admin" ? (
												<button
													type="button"
													className={`${buttonClass} h-8 w-auto px-2 text-xs`}
													disabled={mutation.isPending}
													onClick={() =>
														mutation.mutate({
															userId: row.id,
															emailVerified: Boolean(row.emailVerified),
															banned: Boolean(row.banned),
															role: "user",
														})
													}
												>
													Demote
												</button>
											) : null}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					<p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
						{data.total} user{data.total === 1 ? "" : "s"} · peer protection
						blocks ban/demote of admins
					</p>
				</div>
			) : null}
			{mutation.error ? (
				<p className="mt-2 text-sm text-red-600" role="alert">
					{(mutation.error as Error).message}
				</p>
			) : null}
		</AdminShell>
	);
}
