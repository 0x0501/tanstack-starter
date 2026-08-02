import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

/**
 * Access-control statements + roles for the Better Auth admin plugin.
 * Starter roles: user / admin / superadmin only (no product-domain roles).
 *
 * Resources:
 * - `config` — system settings including payment method toggles.
 */
export const statement = {
	...defaultStatements, // user: [...], session: [...] from the admin plugin
	config: ["read", "manage"],
} as const;

export const ac = createAccessControl(statement);

export const user = ac.newRole({
	config: [],
});

/** Full admin user/session powers + config. */
export const admin = ac.newRole({
	...adminAc.statements,
	config: ["read", "manage"],
});

/** Alias: superadmin is the same capability set, distinguished only by name. */
export const superadmin = admin;
