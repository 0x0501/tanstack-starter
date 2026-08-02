import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/shells";
import * as m from "@/paraglide/messages";
import { listAuditEvents } from "@/server/admin-audit";

export const Route = createFileRoute("/admin/audit")({
	component: AdminAuditPage,
});

function AdminAuditPage() {
	const { data, isLoading, error } = useQuery({
		queryKey: ["admin-audit"],
		queryFn: () => listAuditEvents({ data: { limit: 100 } }),
	});

	return (
		<AdminShell title={m.admin_audit_title()}>
			{isLoading ? <p className="text-sm text-neutral-500">Loading…</p> : null}
			{error ? (
				<p className="text-sm text-red-600" role="alert">
					{(error as Error).message}
				</p>
			) : null}
			{data && data.length === 0 ? (
				<p className="text-sm text-neutral-600">No audit events yet.</p>
			) : null}
			{data && data.length > 0 ? (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[40rem] border-collapse text-left text-sm">
						<thead>
							<tr className="border-b border-neutral-200 dark:border-neutral-800">
								<th className="py-2 pr-3 font-medium">When</th>
								<th className="py-2 pr-3 font-medium">Action</th>
								<th className="py-2 pr-3 font-medium">Actor</th>
								<th className="py-2 pr-3 font-medium">Target</th>
								<th className="py-2 font-medium">Detail</th>
							</tr>
						</thead>
						<tbody>
							{data.map((row) => (
								<tr
									key={row.id}
									className="border-b border-neutral-100 dark:border-neutral-900"
								>
									<td className="py-2 pr-3 whitespace-nowrap text-xs">
										{row.createdAt}
									</td>
									<td className="py-2 pr-3 font-mono text-xs">{row.action}</td>
									<td className="py-2 pr-3 font-mono text-xs">
										{row.actorId ?? "—"}
									</td>
									<td className="py-2 pr-3 font-mono text-xs">
										{row.targetType}:{row.targetId ?? "—"}
									</td>
									<td className="py-2 font-mono text-xs text-neutral-600">
										{row.detail ? JSON.stringify(row.detail) : "—"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : null}
		</AdminShell>
	);
}
