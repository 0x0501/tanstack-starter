import { compile } from "@inlang/paraglide-js";
import { paraglideOptions } from "../paraglide.config";

// Regenerate src/paraglide before Vitest, which doesn't run the Vite plugin.
// `isServer` uses a Node-friendly check so the compiled runtime works in the
// test runner as well as the app build.
await compile({
	...paraglideOptions,
	isServer: "typeof window === 'undefined'",
});

console.log("✓ paraglide compiled (en, de)");
