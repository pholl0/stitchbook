import {
  pgTable, uuid, text, boolean, timestamp, jsonb,
  numeric, date, index,
} from 'drizzle-orm/pg-core'
import { orderStatusEnum, paymentMethodEnum, fitIssueSeverityEnum, fittingSessionTypeEnum } from './enums.js'
import { shops } from './shops.js'
import { clients } from './clients.js'
import { workers } from './workers.js'
import { measurementSessions } from './measurements.js'
import { garmentTemplates } from './templates.js'

// ─── Orders ───────────────────────────────────────────────────
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  assignedTo: uuid('assigned_to').references(() => workers.id),

  // Human-readable order number within the shop (e.g. "#0042")
  orderNumber: text('order_number').notNull(),

  status: orderStatusEnum('status').notNull().default('booked'),
  priority: text('priority').notNull().default('normal'), // 'low' | 'normal' | 'high' | 'urgent'

  dueDate: date('due_date'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),

  // Financials — stored in shop's currency
  totalPrice: numeric('total_price', { precision: 10, scale: 2 }),
  depositAmount: numeric('deposit_amount', { precision: 10, scale: 2 }),
  paidAmount: numeric('paid_amount', { precision: 10, scale: 2 }).notNull().default('0'),

  internalNotes: text('internal_notes'),
  clientNotes: text('client_notes'), // visible to client in portal

  // Photo keys stored in R2
  photoKeys: jsonb('photo_keys').$type<string[]>().notNull().default([]),

  sbSyncedAt: timestamp('sb_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  shopIdx: index('orders_shop_idx').on(table.shopId),
  clientIdx: index('orders_client_idx').on(table.clientId),
  statusIdx: index('orders_status_idx').on(table.shopId, table.status),
  dueDateIdx: index('orders_due_date_idx').on(table.shopId, table.dueDate),
}))

// ─── Order Payments ───────────────────────────────────────────
export const orderPayments = pgTable('order_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  recordedBy: uuid('recorded_by').references(() => workers.id),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  method: paymentMethodEnum('method').notNull().default('cash'),
  reference: text('reference'), // bank reference, receipt number, etc.
  notes: text('notes'),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Garment Items ────────────────────────────────────────────
// Each garment within an order. An order can have multiple garment items.
// Each garment item links to the EXACT measurement session used to cut it.
export const garmentItems = pgTable('garment_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),

  // The measurement session whose L3 cut values were used to cut this garment
  // Nullable — garment items are created during order booking before measurements exist
  measurementSessionId: uuid('measurement_session_id')
    .references(() => measurementSessions.id),

  templateId: uuid('template_id')
    .notNull()
    .references(() => garmentTemplates.id),

  // Fabric from inventory (nullable — may be client-supplied)
  fabricId: uuid('fabric_id'),

  // Override cut values specific to this garment item
  // These start as a copy of session.cutValues and may be adjusted
  cutValuesOverride: jsonb('cut_values_override').$type<Record<string, number | string>>(),

  yardageEstimated: numeric('yardage_estimated', { precision: 6, scale: 2 }),
  yardageUsed: numeric('yardage_used', { precision: 6, scale: 2 }),

  styleNotes: text('style_notes'),
  // Photo keys: in-progress, fitting, finished
  photoKeys: jsonb('photo_keys').$type<{
    inProgress?: string[]
    fitting?: string[]
    finished?: string[]
  }>().notNull().default({}),

  // Alteration log — what was adjusted after delivery
  alterations: jsonb('alterations').$type<Array<{
    date: string
    description: string
    fieldAdjustments: Record<string, number>
    isConstructionError: boolean
    isMeasurementError: boolean
    isCutError: boolean
    resolvedBy?: string // worker id
  }>>().notNull().default([]),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orderIdx: index('garment_items_order_idx').on(table.orderId),
  sessionIdx: index('garment_items_session_idx').on(table.measurementSessionId),
}))

// ─── Fitting Sessions ─────────────────────────────────────────
export const fittingSessions = pgTable('fitting_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  garmentItemId: uuid('garment_item_id').notNull().references(() => garmentItems.id, { onDelete: 'cascade' }),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  conductedBy: uuid('conducted_by').references(() => workers.id),

  sessionType: fittingSessionTypeEnum('session_type').notNull().default('first_fitting'),
  sessionDate: date('session_date').notNull(),

  // Structured fit issues
  fitIssues: jsonb('fit_issues').$type<Array<{
    category: string       // 'silhouette' | 'shoulder' | 'back' | 'sleeve' | 'length'
    issue: string          // e.g. 'swayback_fold' | 'shoulder_roll'
    severity: 'minor' | 'moderate' | 'significant'
    adjustmentMade: string // e.g. 'let_out_back_seam'
    amountCm?: number
  }>>().notNull().default([]),

  freeNotes: text('free_notes'),

  // R2 keys: before and after photos
  beforePhotoKeys: jsonb('before_photo_keys').$type<string[]>().notNull().default([]),
  afterPhotoKeys: jsonb('after_photo_keys').$type<string[]>().notNull().default([]),

  clientApproved: boolean('client_approved'),
  clientApprovedAt: timestamp('client_approved_at', { withTimezone: true }),
  clientApprovalNotes: text('client_approval_notes'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  garmentIdx: index('fitting_sessions_garment_idx').on(table.garmentItemId),
}))
