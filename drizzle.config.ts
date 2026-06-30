import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: ['.env'] })

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
   accountId: "",
   databaseId: "",
   token: "" 
  },
})
