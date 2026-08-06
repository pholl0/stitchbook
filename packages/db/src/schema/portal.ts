import {
  pgTable, uuid, text, boolean, timestamp, jsonb, index,
} from 'drizzle-orm/pg-core'
import { portalTokenTypeEnum, submissionStatusEnum, notificationChannelEnum } from './enums.js'
import { shops } from './shops.js'
import { clients } from './clients.js'
import { workers } from './workers.js'
import { measurementSessions } from './measurements.js'
import { garmentTemplates } from './templates.js'

// ─── One-Time Portal Tokens ───────────────────────────────────
// For measure invites, approval requests, order deep-links, AND worker invites.
// NOTE: clientId is nullable because worker_invite tokens are not scoped to a client.
export const portalOtpTokens = pgTable('portal_otp_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').references(() => workers.id),
  tokenHash: text('token_hash').notNull().unique(),
  tokenType: portalTokenTypeEnum('token_type').notNull(),
  // References the related resource (worker_id for worker invites, order_id, measurement_id)
  resourceId: uuid('resource_id'),
  // Template context for measure invites
  templateId: uuid('template_id').references(() => garmentTemplates.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Client Self-Measurement Submissions ──────────────────────
// Created when a client submits measurements via portal.
// Reviewed by the tailor before being accepted as a session.
export const portalMeasurementSubmissions = pgTable('portal_measurement_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  inviteTokenId: uuid('invite_token_id').references(() => portalOtpTokens.id),
  templateId: uuid('template_id').references(() => garmentTemplates.id),

  // Submitted measurement values (L1 body measurements only)
  submittedValues: jsonb('submitted_values')
    .$type<Record<string, number | string>>()
    .notNull()
    .default({}),

  // R2 keys for submitted photos (front, side, back)
  photoKeys: jsonb('photo_keys').$type<string[]>().notNull().default([]),
  // R2 key for submitted video (optional)
  videoKey: text('video_key'),
  // Submission round (1 = initial, 2+ = after clarification request)
  round: text('round').notNull().default('1'),

  clientNotes: text('client_notes'),
  unit: text('unit').notNull().default('cm'),

  status: submissionStatusEnum('status').notNull().default('pending'),
  reviewedBy: uuid('reviewed_by').references(() => workers.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNotes: text('review_notes'),

  // Clarification request — fields flagged by tailor
  clarificationFields: jsonb('clarification_fields').$type<Array<{
    fieldKey: string
    taiiorNote: string
  }>>(),
  clarificationSentAt: timestamp('clarification_sent_at', { withTimezone: true }),

  // Set when accepted — links to the created measurement session
  sessionId: uuid('session_id').references(() => measurementSessions.id),

  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  clientIdx: index('submissions_client_idx').on(table.clientId),
  shopIdx: index('submissions_shop_idx').on(table.shopId),
  statusIdx: index('submissions_status_idx').on(table.shopId, table.status),
}))

// ─── Client Notification Preferences ─────────────────────────
export const clientNotificationPrefs = pgTable('client_notification_prefs', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  language: text('language').notNull().default('en'),
  notifyWhatsapp: boolean('notify_whatsapp').notNull().default(true),
  notifySms: boolean('notify_sms').notNull().default(false),
  notifyEmail: boolean('notify_email').notNull().default(false),
  // Which events trigger notifications
  events: jsonb('events').$type<{
    order_status?: boolean
    ready?: boolean
    measure_reminder?: boolean
    fitting_reminder?: boolean
    payment_reminder?: boolean
  }>().notNull().default({
    order_status: true,
    ready: true,
    measure_reminder: true,
  }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Notification Log ─────────────────────────────────────────
export const notificationLog = pgTable('notification_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  workerId: uuid('worker_id').references(() => workers.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').references(() => clients.id),
  channel: notificationChannelEnum('channel').notNull(),
  eventType: text('event_type').notNull(),
  resourceType: text('resource_type'), // 'order' | 'client' | null
  resourceId: uuid('resource_id'),
  message: text('message').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp('read_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  failureReason: text('failure_reason'),
  externalMessageId: text('external_message_id'), // Twilio/Resend message ID
}, (table) => ({
  shopIdx: index('notifications_shop_idx').on(table.shopId),
  clientIdx: index('notifications_client_idx').on(table.clientId),
}))
