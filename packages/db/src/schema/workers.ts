import {
  pgTable, uuid, text, boolean, timestamp, jsonb, unique,
} from 'drizzle-orm/pg-core'
import { workerRoleEnum, unitEnum } from './enums.js'
import { shops } from './shops.js'

// ─── Workers ──────────────────────────────────────────────────
// All human users of the StitchBook tailor-side app.
// "owner" is created on shop registration.
export const workers = pgTable('workers', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  // Better Auth will manage the auth session — this links to the auth user
  authUserId: text('auth_user_id').notNull().unique(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  role: workerRoleEnum('role').notNull().default('tailor'),
  preferredUnit: unitEnum('preferred_unit').notNull().default('cm'),
  preferredLanguage: text('preferred_language').notNull().default('en'),
  avatarKey: text('avatar_key'), // R2 object key
  isActive: boolean('is_active').notNull().default(true),
  // Push notification tokens
  pushTokens: jsonb('push_tokens').$type<string[]>().notNull().default([]),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Worker Invites ───────────────────────────────────────────
export const workerInvites = pgTable('worker_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  invitedBy: uuid('invited_by').notNull().references(() => workers.id),
  email: text('email'),
  phone: text('phone'),
  role: workerRoleEnum('role').notNull().default('tailor'),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
