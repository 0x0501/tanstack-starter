import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { createAuthClient } from "better-auth/client";

export const serverClient = createAuthClient({
	plugins: [
		oauthProviderResourceClient(), // auth optional
	],
});
