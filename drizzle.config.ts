import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: ['.env'] })

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  // D1 over HTTP: the sqlite dialect needs this driver, otherwise drizzle-kit
  // expects a local `url`. Credentials come from env so `db:push`/`db:migrate`
  // work against the remote D1 (db:generate needs none).
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    databaseId: process.env.CLOUDFLARE_DATABASE_ID ?? '',
    token: process.env.CLOUDFLARE_D1_TOKEN ?? '',
  },
})
