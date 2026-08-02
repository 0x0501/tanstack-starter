/**
 * Better Auth HTTP paths the router must not expose.
 *
 * `disabledPaths` only 404s the *router* — server-side `auth.api.*` calls still
 * reach these endpoints, which is how the app uses every one of them. Kept in
 * its own binding-free module so tests can assert the list against routes a
 * real auth instance mounts.
 *
 * The Starter deliberately omits Better Auth's api-key plugin (not a platform
 * default), so those paths are not listed here.
 */

/**
 * OTPs are issued and consumed exclusively through account-security server
 * fns, with the email always taken from the session. Public email-OTP sign-in
 * would also bypass the social/password 2FA challenge design.
 */
const EMAIL_OTP_PATHS = [
	"/email-otp/send-verification-otp",
	"/email-otp/check-verification-otp",
	"/email-otp/verify-email",
	"/sign-in/email-otp",
	"/email-otp/request-password-reset",
	"/forget-password/email-otp",
	"/email-otp/reset-password",
	"/email-otp/request-email-change",
	"/email-otp/change-email",
] as const;

/**
 * 2FA management is OTP/TOTP-gated through account-security server fns, so
 * password-gated HTTP endpoints stay off. `verify-totp` / `verify-backup-code`
 * remain public — sign-in and enrollment confirmation need them.
 */
const TWO_FACTOR_PATHS = [
	"/two-factor/enable",
	"/two-factor/disable",
	"/two-factor/generate-backup-codes",
	"/two-factor/get-totp-uri",
	"/two-factor/send-otp",
	"/two-factor/verify-otp",
] as const;

/**
 * The whole admin plugin surface. These routes check nothing but
 * `hasPermission`, so a plain admin holding `user:set-role` could demote a
 * superadmin over HTTP. Admin UI goes through `auth.api.*` and server fns.
 */
const ADMIN_PATHS = [
	"/admin/set-role",
	"/admin/create-user",
	"/admin/update-user",
	"/admin/list-users",
	"/admin/list-user-sessions",
	"/admin/unban-user",
	"/admin/ban-user",
	"/admin/impersonate-user",
	"/admin/stop-impersonating",
	"/admin/revoke-user-session",
	"/admin/revoke-user-sessions",
	"/admin/remove-user",
	"/admin/set-user-password",
	"/admin/get-user",
	"/admin/has-permission",
] as const;

/**
 * Endpoints Turnstile must gate. Explicit so captcha coverage tests pin the
 * list against mounted password paths rather than trusting plugin defaults.
 */
export const CAPTCHA_ENDPOINTS = [
	"/sign-up/email",
	"/sign-in/email",
	"/request-password-reset",
] as const;

/**
 * Credential mutations whose guards live in account-security server fns.
 * `/change-password` skips session eviction; `/passkey/delete-passkey` has no
 * freshness gate in the library.
 */
const CREDENTIAL_MUTATION_PATHS = [
	"/change-password",
	"/passkey/delete-passkey",
] as const;

export const DISABLED_AUTH_PATHS = [
	// jwt plugin session→JWT shortcut: tokens only through OAuth flow.
	"/token",
	...EMAIL_OTP_PATHS,
	...TWO_FACTOR_PATHS,
	...ADMIN_PATHS,
	...CREDENTIAL_MUTATION_PATHS,
] as const;
