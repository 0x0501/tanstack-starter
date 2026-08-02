import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";
import {
	adminClient,
	inferAdditionalFields,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
// Type-only import: a value import would drag server-only code into the client.
import type { auth } from "@/lib/auth";
import { localizedAuthPath } from "@/utils/auth-redirect";
import { ac, admin, superadmin, user } from "./permissions";

export const authClient = createAuthClient({
	plugins: [
		adminClient({ ac, roles: { admin, superadmin, user } }),
		oauthProviderClient(),
		passkeyClient(),
		twoFactorClient({
			onTwoFactorRedirect() {
				// Locale-prefixed challenge page so full-app URL i18n is preserved.
				window.location.href = `${localizedAuthPath("/two-factor")}${window.location.search}`;
			},
		}),
		inferAdditionalFields<typeof auth>(),
	],
});
