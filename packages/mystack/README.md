# Mystack CLI

Create a configured copy of this starter:

```sh
mystack create
mystack create my-app --database d1 --payments stripe,polar
mystack create my-app --yes --database turso-local --deployment bun --email resend --payments none --no-install
```

The executable runs on Node 22.12+. Generated projects use Bun to install dependencies and run scripts. The wizard follows TanStack CLI's Clack interaction: guided selections, keyboard hints, a configuration summary and final confirmation, progress indicators, and commands to start the project. Use arrow keys to navigate, Space to toggle payment providers, and Enter to confirm; an empty payment selection means none. Ctrl-C or Escape cancels during configuration without creating a project. D1 and Cloudflare Email show incompatible options as disabled with a reason. Flags use the same validation rules; `--yes` skips all prompts. Failed dependency installation keeps the generated project and shows the command to retry.

## Databases

| Choice | Flag | Connection | Deployments |
|---|---|---|---|
| PostgreSQL | `pg` | Direct app-role `DATABASE_URL` | Nitro, Bun |
| PostgreSQL (Hyperdrive) | `pg-hyperdrive` | Cloudflare `HYPERDRIVE` binding | Cloudflare Workers |
| Cloudflare D1 | `d1` | Cloudflare `DB` binding | Cloudflare Workers |
| Turso Cloud | `turso-cloud` | Remote `TURSO_DATABASE_URL` and required `TURSO_AUTH_TOKEN` | All |
| Turso Local (libSQL) | `turso-local` | `TURSO_DATABASE_URL=file:local.db`, no cloud token | Nitro, Bun |
| Bun SQLite | `bun-sqlite` | Native `bun:sqlite`, `SQLITE_DATABASE_PATH=local.db` | Bun |

The default is PostgreSQL (Hyperdrive) with Cloudflare Workers. PostgreSQL migrations use the privileged `DATABASE_MIGRATION_URL`; runtime connections use the app role. Turso Cloud accepts remote `libsql://` or `https://` URLs and requires cloud credentials before migration and startup. Local databases need persistent file storage in production; generated projects ignore database files and their WAL sidecars in Git.

```sh
mystack create cloud-app --database turso-cloud
mystack create local-app --database turso-local --deployment nitro --email resend
mystack create bun-app --database bun-sqlite --deployment bun --email resend
```

## Develop and distribute

```sh
bun install --cwd packages/mystack
bun run --cwd packages/mystack template:prepare
node packages/mystack/src/cli.mjs create
npm pack ./packages/mystack
npm install -g ./mystack-cli-0.1.0.tgz
mystack create
```

The tarball contains a template snapshot and adapters. It works outside this checkout without fetching a moving Git branch. `prepack` refreshes the snapshot from an explicit allowlist; secrets, Git history, dependencies, and local build output are excluded. The package is ready for a scoped npm release; publishing requires ownership of the `@mystack` scope.

## Extend

`src/catalog.mjs` defines option IDs, labels, and compatibility requirements. Both the wizard and noninteractive validation consume it. Category adapters in `src/adapters/` produce source, dependencies, scripts, environment declarations and resource configuration. Add an option to its catalog and implement it in the category adapter. Payment API definitions live in the payment adapter. Add tests for new option combinations before exposing them. Template edits use checked anchors and fail explicitly when the underlying starter changes.

SQLite auth schema is generated from the starter's actual auth config:

```sh
node packages/mystack/scripts/generate-auth-schema.mjs
bun x drizzle-kit generate --config packages/mystack/assets/drizzle.config.ts
```

Never hand-edit the generated auth schema. Platform SQLite tables are maintained in `assets/platform.sqlite.schema.ts`. D1 and Turso use atomic batch operations and a durable `purchase_delivery` event; product fulfillment consumes it using `purchase_id` as its idempotency key. PG supports the transaction callback in `onPurchasePaid`. SQLite authorization is enforced in authenticated/admin middleware and explicit user predicates, rather than PG RLS.

Run `bun run test:cli` for the 208 valid selection combinations, filesystem safety and flag constraints. Run `bun run --cwd packages/mystack test:generated` to install, check, typecheck, test and build all 13 database/runtime/email tuples with all payment providers. PG integration checks need Docker. SQLite tests use real local libSQL, D1 (workerd), and native Bun SQLite, including concurrent confirmation, rollback and credential revocation. Turso Cloud uses an isolated local libSQL fixture for service tests; validating a live cloud connection requires your URL and token. Bun SQLite runs its native database tests with `bun test` after Vitest because `bun:sqlite` is unavailable in Node.

## Reference

The deployment adapters follow [TanStack Start hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting). Composition follows the template/add-on separation in the [TanStack CLI](https://tanstack.com/cli/latest/docs/creating-add-ons). Nitro uses its Node preset; Bun uses Start's server bundle with a native `Bun.serve` entry. Credentials and cloud resource IDs must be supplied by the project owner; generation does not create paid cloud resources.
