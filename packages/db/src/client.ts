import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index.js'

const connectionString = process.env['DATABASE_URL']
if (!connectionString) throw new Error('DATABASE_URL is required')

// Connection pool for API server
const pool = postgres(connectionString, {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
})

// Single connection for migrations/scripts
export const migrationClient = postgres(connectionString, { max: 1 })

export const db = drizzle(pool, { schema, logger: process.env['NODE_ENV'] === 'development' })

export type DB = typeof db
