#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, stripVTControlCharacters } from "node:util";
import {
	cancel,
	confirm,
	intro,
	isCancel,
	log,
	multiselect,
	note,
	outro,
	select,
	spinner,
	text,
} from "@clack/prompts";
import {
	catalog,
	choices,
	defaults,
	incompatibilities,
	isPostgres,
	validateSelection,
} from "./catalog.mjs";
import { createProject, validateName } from "./generate.mjs";

const help = `mystack create [name] [options]

Create a configured TanStack Start project with an interactive wizard.

  --database ${catalog.database.map((option) => option.id).join("|")}
  --deployment cloudflare|nitro|bun
  --email cloudflare|resend
  --payments stripe,creem,nowpayments,polar|none
  --yes          Use defaults for unspecified options
  --no-install   Generate without installing dependencies
  --help         Show this help

Example: mystack create my-app --database d1 --payments stripe,polar
Package manager: Bun. Hyperdrive, D1 and Cloudflare Email require Cloudflare Workers.
Turso Local needs a filesystem. Bun SQLite requires the Bun deployment.
`;

class PromptCancelled extends Error {}

async function answer(prompt) {
	const value = await prompt;
	if (isCancel(value)) throw new PromptCancelled();
	return value;
}

async function step(message, complete, task) {
	const progress = spinner();
	progress.start(message);
	try {
		const result = await task(progress.message);
		progress.stop(complete);
		return result;
	} catch (error) {
		progress.error("Step failed");
		throw error;
	}
}

export function installDependencies(target) {
	return new Promise((resolveInstall, reject) => {
		const child = spawn("bun", ["install"], {
			cwd: target,
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
		});
		let output = "";
		const capture = (chunk) => {
			output = (output + chunk.toString()).slice(-16_384);
		};
		child.stdout.on("data", capture);
		child.stderr.on("data", capture);
		child.on("error", reject);
		child.on("close", (code, signal) => {
			if (code === 0) resolveInstall();
			else
				reject(
					new Error(
						`bun install ${signal ? `was stopped by ${signal}` : `exited with ${code}`}\n${stripVTControlCharacters(output).trim()}`,
					),
				);
		});
	});
}

export async function main(args = process.argv.slice(2)) {
	try {
		const { values, positionals } = parseArgs({
			args,
			allowPositionals: true,
			options: {
				database: { type: "string" },
				deployment: { type: "string" },
				email: { type: "string" },
				payments: { type: "string" },
				yes: { type: "boolean", short: "y" },
				"no-install": { type: "boolean" },
				help: { type: "boolean", short: "h" },
			},
		});
		if (values.help) {
			console.log(help);
			return 0;
		}
		if (positionals[0] !== "create" || positionals.length > 2)
			throw new Error(help);
		const selection = {};
		for (const category of ["database", "deployment", "email"]) {
			if (values[category] !== undefined)
				selection[category] = values[category];
		}
		if (values.payments !== undefined)
			selection.payments =
				values.payments === "none"
					? []
					: values.payments.split(",").map((id) => id.trim());
		const invalid = incompatibilities(selection);
		if (invalid.length) throw new Error(invalid.join("\n"));
		if (!values.yes && !process.stdin.isTTY)
			throw new Error(
				"Interactive input requires a terminal. Use --yes and configuration flags in automation.",
			);
		intro(
			values.yes
				? `Creating a new Mystack app in ${positionals[1] ?? "my-app"}...`
				: "Let's configure your Mystack application",
		);
		const checkName = (value) => {
			try {
				validateName(value);
				if (existsSync(resolve(value)))
					return `Directory '${value}' already exists. Choose another project name.`;
			} catch (error) {
				return error.message;
			}
		};
		const name =
			positionals[1] ??
			(values.yes
				? "my-app"
				: await answer(
						text({
							message: "Project name",
							placeholder: "my-app",
							defaultValue: "my-app",
							validate: (value) => checkName(value || "my-app"),
						}),
					));
		const nameError = checkName(name);
		if (nameError) throw new Error(nameError);
		const messages = {
			database: "Select database:",
			deployment: "Select deployment adapter:",
			email: "Select email provider:",
		};
		for (const category of ["database", "deployment", "email"]) {
			if (selection[category] !== undefined) continue;
			const options = choices(category, selection);
			const preferred =
				options.find(
					(option) => option.value === defaults[category] && !option.disabled,
				) ?? options.find((option) => !option.disabled);
			if (!preferred) throw new Error(`No compatible ${category} choices.`);
			selection[category] = values.yes
				? preferred.value
				: await answer(
						select({
							message: messages[category],
							options: options.map((option) => ({
								value: option.value,
								label: option.name,
								hint: option.disabled || option.hint,
								disabled: Boolean(option.disabled),
							})),
							initialValue: preferred.value,
							showInstructions: false,
						}),
					);
		}
		if (selection.payments === undefined) {
			if (values.yes) selection.payments = defaults.payments;
			else {
				note(
					"Use ↑/↓ to navigate • Space to select/deselect • Enter to confirm",
					"Keyboard Shortcuts",
				);
				selection.payments = await answer(
					multiselect({
						message:
							"What payment providers would you like? (Space to toggle, Enter to confirm)",
						options: catalog.payments.map((option) => ({
							label: option.label,
							value: option.id,
						})),
						required: false,
						showInstructions: false,
					}),
				);
			}
		}
		validateSelection(selection);
		const install = values["no-install"]
			? false
			: values.yes
				? true
				: await answer(
						confirm({
							message: "Would you like to install dependencies now?",
							initialValue: true,
						}),
					);
		const label = (category, id) =>
			catalog[category].find((option) => option.id === id).label;
		log.info(
			`About to create:\n\n${[
				["Project", name],
				["Location", resolve(name)],
				["Framework", "TanStack Start (React)"],
				["Package manager", "Bun"],
				["Database", label("database", selection.database)],
				["Deploy", label("deployment", selection.deployment)],
				["Email", label("email", selection.email)],
				[
					"Payments",
					selection.payments.map((id) => label("payments", id)).join(", ") ||
						"None",
				],
				["Install deps", install ? "yes" : "no"],
			]
				.map(([key, value]) => `  ${`${key}:`.padEnd(17)}${value}`)
				.join("\n")}`,
		);
		if (
			!values.yes &&
			!(await answer(
				confirm({
					message: "Continue with these settings?",
					initialValue: true,
				}),
			))
		) {
			cancel("Operation cancelled.");
			return 0;
		}
		const target = await step(
			"Creating project files...",
			"Project files created",
			(onProgress) => createProject({ name, selection, onProgress }),
		);
		if (install) {
			try {
				await step(
					"Installing dependencies via Bun...",
					"Installed dependencies",
					() => installDependencies(target),
				);
			} catch (error) {
				log.error(error.message);
				note(
					`Your project is saved at ${target}.\n\n% cd ${name}\n% bun install\n\nThen follow README.md to configure and start your app.`,
					"Retry installation",
				);
				cancel("Dependency installation failed.");
				return 1;
			}
		} else log.step("Dependency installation skipped");
		outro(
			`Your Mystack app is ready in '${name}'.\n\nUse the following commands to start your app:\n% cd ${name}\n${install ? "" : "% bun install\n"}% cp .env.example .env\n\nConfigure .env using README.md, then run:\n${isPostgres(selection.database) ? "% bun run db:up\n" : ""}% bun run db:migrate\n% bun run dev`,
		);
		return 0;
	} catch (error) {
		if (error instanceof PromptCancelled) {
			cancel("Operation cancelled.");
			return 130;
		}
		log.error(error.message);
		return 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
)
	process.exitCode = await main();
