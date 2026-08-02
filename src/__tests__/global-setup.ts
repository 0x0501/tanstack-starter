import { existsSync } from "node:fs";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import type { TestProject } from "vitest/node";

declare module "vitest" {
	interface ProvidedContext {
		pgUri: string;
		pgRlsAppUri: string;
	}
}

/**
 * One Postgres container for the whole run.
 *
 * - `postgres` superuser (`pgUri`): temp-table suites (CREATE TEMP TABLE isolation).
 * - `rls_test` as `starter_app` (`pgRlsAppUri`): real migrations, NOBYPASSRLS —
 *   policies and GUC contexts match Hyperdrive production.
 *
 * Migration 0000 references role/database names used by local Hyperdrive
 * (`starter_app`, CONNECT on database `postgres`); the container uses the same
 * username/database so those grants apply.
 */
export default async function setup(project: TestProject) {
	// Pure unit suites (pipeline, search params, HttpError wire) can run without
	// Docker. Integration suites that call inject("pgUri") still require a real
	// container — they will fail closed if this path is used.
	if (process.env.SKIP_TESTCONTAINERS === "1") {
		project.provide("pgUri", "");
		project.provide("pgRlsAppUri", "");
		return;
	}

	configureDockerRuntime();
	const container = await new PostgreSqlContainer("postgres:17")
		.withUsername("postgres")
		.withPassword("postgres")
		.withDatabase("postgres")
		.start();
	project.provide("pgUri", container.getConnectionUri());

	const admin = new Pool({
		connectionString: container.getConnectionUri(),
		max: 1,
	});
	await admin.query("CREATE DATABASE rls_test");
	await admin.end();

	const rlsAdmin = new Pool({
		connectionString: container
			.getConnectionUri()
			.replace(/\/postgres(\?|$)/, "/rls_test$1"),
		max: 1,
	});
	await migrate(drizzle(rlsAdmin), { migrationsFolder: "./drizzle" });
	// Known test password; migration 0000 bakes the local-dev default.
	await rlsAdmin.query("ALTER ROLE starter_app PASSWORD 'rls_test'");
	// Migration 0000 grants CONNECT on database `postgres` only.
	await rlsAdmin.query("GRANT CONNECT ON DATABASE rls_test TO starter_app");
	await rlsAdmin.end();

	project.provide(
		"pgRlsAppUri",
		`postgresql://starter_app:rls_test@${container.getHost()}:${container.getMappedPort(5432)}/rls_test`,
	);

	return async () => {
		await container.stop();
	};
}

function configureDockerRuntime() {
	const orbstackSocket = `${process.env.HOME}/.orbstack/run/docker.sock`;
	if (!process.env.DOCKER_HOST && existsSync(orbstackSocket)) {
		process.env.DOCKER_HOST = `unix://${orbstackSocket}`;
	}
	process.env.TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE ??= "/var/run/docker.sock";
}
