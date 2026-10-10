import { defineConfig } from "drizzle-kit";
export default defineConfig({ out: "./packages/mystack/assets/sqlite-migrations", schema: ["./packages/mystack/assets/auth.sqlite.schema.ts", "./packages/mystack/assets/platform.sqlite.schema.ts"], dialect: "sqlite" });
