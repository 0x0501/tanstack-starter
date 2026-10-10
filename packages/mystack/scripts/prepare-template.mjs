import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readTemplate } from "../src/template.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const destination = fileURLToPath(new URL("../template/", import.meta.url));
const files = await readTemplate(root);
const { copyFile } = await import("node:fs/promises");
await copyFile(join(root, "LICENSE"), fileURLToPath(new URL("../LICENSE", import.meta.url)));
await rm(destination, { recursive: true, force: true });
for (const [path, contents] of files) {
	await mkdir(dirname(join(destination, path === ".gitignore" ? "gitignore" : path)), { recursive: true });
	await writeFile(join(destination, path === ".gitignore" ? "gitignore" : path), contents);
}
console.error(`Bundled ${files.size} template files.`);
