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
			{isLoading ? (
				<p className="text-sm text-muted-foreground">{m.common_loading()}</p>
			) : null}
			{error ? (
				<p className="text-sm text-red-600" role="alert">
					{(error as Error).message}
				</p>
			) : null}
			{data && data.length === 0 ? (
				<p className="text-sm text-muted-foreground">{m.admin_audit_empty()}</p>
			) : null}
			{data && data.length > 0 ? (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[40rem] border-collapse text-left text-sm">
						<thead>
							<tr className="border-b border-border">
								<th className="py-2 pr-3 font-medium">{m.admin_col_when()}</th>
								<th className="py-2 pr-3 font-medium">
									{m.admin_col_action()}
								</th>
								<th className="py-2 pr-3 font-medium">{m.admin_col_actor()}</th>
								<th className="py-2 pr-3 font-medium">
									{m.admin_col_target()}
								</th>
								<th className="py-2 font-medium">{m.admin_col_detail()}</th>
							</tr>
						</thead>
						<tbody>
							{data.map((row) => (
								<tr key={row.id} className="border-b border-border">
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
									<td className="py-2 font-mono text-xs text-muted-foreground">
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
