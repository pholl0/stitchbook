import {
  pgTable, uuid, text, boolean, timestamp, jsonb, index,
} from 'drizzle-orm/pg-core'
import { unitEnum } from './enums.js'
import { shops } from './shops.js'
import { workers } from './workers.js'

// ─── Clients ──────────────────────────────────────────────────
// A client of a tailoring shop. Not a StitchBook user.
// Clients are identified by their token, not a username/password.
export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').references(() => workers.id),

  // Identity
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  photoKey: text('photo_key'), // R2 object key

  // Preferences
  preferredUnit: unitEnum('preferred_unit').notNull().default('cm'),
  preferredLanguage: text('preferred_language').notNull().default('en'),
  timezone: text('timezone'),

  // Body classification — structured tags for body type
  // e.g. ["petite", "broad_shoulder", "full_seat"]
  bodyTypeTags: jsonb('body_type_tags').$type<string[]>().notNull().default([]),

  // Posture profile — structured assessment
  // e.g. { swayback: true, shoulder_drop_R: 0.5, forward_head: false }
  postureProfile: jsonb('posture_profile').$type<Record<string, unknown>>().notNull().default({}),

  // Style preferences — saved for reference
  // e.g. { fit: "fitted", lapel: "peak", lining: "full" }
  stylePreferences: jsonb('style_preferences').$type<Record<string, unknown>>().notNull().default({}),

  // Notes visible to all workers in the shop
  internalNotes: text('internal_notes'),

  isActive: boolean('is_active').notNull().default(true),

  // WatermelonDB sync fields
  sbSyncedAt: timestamp('sb_synced_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  shopIdIdx: index('clients_shop_id_idx').on(table.shopId),
  phoneIdx: index('clients_phone_idx').on(table.shopId, table.phone),
}))

// ─── Client Portal Tokens ─────────────────────────────────────
// Persistent token per client — the credential for the client portal.
export const clientPortalTokens = pgTable('client_portal_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  // BLAKE2b hash of the raw token — never store raw
  tokenHash: text('token_hash').notNull().unique(),
  // First 6 chars of raw token for fast lookup (not secret)
  tokenPrefix: text('token_prefix').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  rotatedAt: timestamp('rotated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  prefixIdx: index('portal_tokens_prefix_idx').on(table.tokenPrefix),
}))
