import {
  pgTable, uuid, text, boolean, timestamp, jsonb,
  date, index, check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { sessionTypeEnum, unitEnum, easeProfileEnum } from './enums.js'
import { shops } from './shops.js'
import { clients } from './clients.js'
import { workers } from './workers.js'
import { garmentTemplates } from './templates.js'

// ─── Measurement Sessions ─────────────────────────────────────
// One record per measurement session per client.
// Sessions are IMMUTABLE once synced — never updated, only added.
// The L3 cut values for a specific garment order are stored on
// the garment_items table, referencing the session.
export const measurementSessions = pgTable('measurement_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  takenBy: uuid('taken_by').references(() => workers.id),
  templateId: uuid('template_id').references(() => garmentTemplates.id),

  sessionType: sessionTypeEnum('session_type').notNull(),
  sessionDate: date('session_date').notNull().default(sql`CURRENT_DATE`),
  unit: unitEnum('unit').notNull().default('cm'),

  // L1 — Raw body measurements
  // { "chest_body": 96.0, "waist_body": 82.0, ... }
  bodyValues: jsonb('body_values').$type<Record<string, number | string>>().notNull().default({}),

  // L2 — Ease allowances
  // { "chest_ease": 6.0, "waist_ease": 3.0, ... }
  easeValues: jsonb('ease_values').$type<Record<string, number>>().notNull().default({}),

  // L3 — Final cut measurements (body + ease + posture corrections)
  // Stored here for general sessions; also stored on garment_items for order-specific cuts
  // { "chest_cut": 104.5, "waist_cut": 87.0, ... }
  cutValues: jsonb('cut_values').$type<Record<string, number | string>>().notNull().default({}),

  // Structured posture notes
  // { "swayback": true, "shoulder_drop_R": 0.5, "prominent_blades": false }
  postureNotes: jsonb('posture_notes').$type<Record<string, unknown>>().notNull().default({}),

  // Free-text tailor notes for this session
  fitNotesText: text('fit_notes_text'),

  easeProfile: easeProfileEnum('ease_profile').notNull().default('regular'),

  // Pin for quick reference (e.g. "Wedding suit 2024")
  isPinned: boolean('is_pinned').notNull().default(false),
  pinLabel: text('pin_label'),

  // Source: was this submitted by the client via the portal?
  isClientSubmission: boolean('is_client_submission').notNull().default(false),
  submissionId: uuid('submission_id'), // references portal_measurement_submissions

  // WatermelonDB sync — once synced, this session is immutable
  syncedAt: timestamp('synced_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  clientIdx: index('sessions_client_idx').on(table.clientId),
  shopIdx: index('sessions_shop_idx').on(table.shopId),
  dateIdx: index('sessions_date_idx').on(table.sessionDate),
  templateIdx: index('sessions_template_idx').on(table.templateId),
  bodyGinIdx: index('sessions_body_gin_idx').on(table.bodyValues),
  postureGinIdx: index('sessions_posture_gin_idx').on(table.postureNotes),
}))

// ─── Measurement Validation Rules ─────────────────────────────
// Shop-level overrides to system validation rules.
// System rules are defined in code (packages/utils/src/validation.ts).
export const measurementValidationOverrides = pgTable('measurement_validation_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id').references(() => garmentTemplates.id),
  fieldKey: text('field_key').notNull(),
  minValue: text('min_value'), // stored as text for flexibility
  maxValue: text('max_value'),
  largeChangeThresholdCm: text('large_change_threshold_cm').default('5'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
