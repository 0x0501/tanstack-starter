import * as m from "@/paraglide/messages";

/**
 * Messages for the `?error=` codes the OAuth callback can bounce back with.
 * `email_not_found` is Better Auth's built-in no-email rejection;
 * `github_email_unverified` comes from the signup gate in
 * `services/account-security`; `account_not_linked` is the built-in refusal to
 * auto-link an unverified provider email onto an existing account.
 */
export function oauthErrorMessage(code: string | undefined): string | null {
	switch (code) {
		case undefined:
			return null;
		case "email_not_found":
			return m.auth_oauth_no_email();
		case "github_email_unverified":
			return m.auth_oauth_email_unverified();
		case "account_not_linked":
			return m.auth_oauth_account_not_linked();
		default:
			return m.auth_oauth_generic();
	}
}

/**
 * The refusal codes `src/services/account-security.ts` returns, as copy.
 *
 * One map rather than a message per call site: every security action can
 * return any of these, and a page that formats the code itself ends up showing
 * `not_fresh` to someone who needs to be told to sign in again.
 */
export function accountSecurityErrorMessage(code: string): string {
	switch (code) {
		case "already_enabled":
			return m.account_err_already_enabled();
		case "cooldown":
			return m.account_err_cooldown();
		case "email_not_found":
			return m.account_err_email_not_found();
		case "github_email_unverified":
			return m.account_err_github_email_unverified();
		case "invalid_code":
			return m.account_err_invalid_code();
		case "not_enabled":
			return m.account_err_not_enabled();
		case "not_fresh":
			return m.account_err_not_fresh();
		case "too_many_attempts":
			return m.account_err_too_many_attempts();
		case "totp_required":
			return m.account_err_totp_required();
		case "unauthorized":
			return m.account_err_unauthorized();
		default:
			return m.auth_error_generic();
	}
}

/** Better Auth verification redirects use SCREAMING_SNAKE; OAuth uses snake_case. */
const VERIFICATION_STYLE_CODE = /^[A-Z][A-Z0-9_]*$/;

/**
 * Messages for `?error=` codes Better Auth appends when email verification
 * fails and redirects to callbackURL (default `/` or `/sign-in`).
 * Codes come from BASE_ERROR_CODES (TOKEN_EXPIRED, INVALID_TOKEN, …).
 */
export function verificationErrorMessage(
	code: string | undefined,
): string | null {
	switch (code) {
		case undefined:
			return null;
		case "TOKEN_EXPIRED":
			return m.auth_verify_token_expired();
		case "INVALID_TOKEN":
			return m.auth_verify_token_invalid();
		case "USER_NOT_FOUND":
			return m.auth_verify_user_not_found();
		default:
			// Other verification-style codes (e.g. INVALID_USER). Leave OAuth
			// snake_case codes (email_not_found, …) for oauthErrorMessage.
			if (VERIFICATION_STYLE_CODE.test(code)) {
				return m.auth_verify_generic();
			}
			return null;
	}
}

/**
 * Prefer verification copy, then OAuth copy, for a shared `?error=` query.
 * Sign-in can receive either class of redirect.
 */
export function authQueryErrorMessage(code: string | undefined): string | null {
	return verificationErrorMessage(code) ?? oauthErrorMessage(code);
}

/**
 * Transport failures, which arrive as a thrown `TypeError` rather than an
 * `{ error }` result — Safari says "Load failed", Chrome "Failed to fetch".
 * Matched by message because neither carries a status or a code.
 */
const NETWORK_MESSAGE =
	/^(Load failed|Failed to fetch|NetworkError when attempting to fetch resource\.?|Network request failed)$/i;

type AuthCallError = {
	message?: string | null;
	status?: number;
	statusCode?: number;
};

export type SettledAuthError = {
	message: string;
	status?: number;
};

/**
 * Run a Better Auth client call that either returns `{ data, error }` or throws
 * on transport failure. Never throws — always returns a settled `{ data, error }`
 * so a page renders a banner instead of hitting the error boundary.
 */
export async function settleAuthCall<T = unknown>(
	call: () => Promise<{ data?: T | null; error?: AuthCallError | null }>,
): Promise<{ data: T; error: null } | { data: null; error: SettledAuthError }> {
	try {
		const result = await call();
		if (result.error) {
			const status =
				typeof result.error.status === "number"
					? result.error.status
					: typeof result.error.statusCode === "number"
						? result.error.statusCode
						: undefined;
			return {
				data: null,
				error: {
					message: result.error.message?.trim() || m.auth_error_generic(),
					...(status !== undefined ? { status } : {}),
				},
			};
		}
		return { data: result.data as T, error: null };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : String(error ?? "");
		if (NETWORK_MESSAGE.test(message)) {
			return { data: null, error: { message: m.auth_error_network() } };
		}
		return {
			data: null,
			error: {
				message:
					(error instanceof Error && error.message.trim()) ||
					m.auth_error_generic(),
			},
		};
	}
}
