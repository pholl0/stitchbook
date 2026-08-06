import {
  pgTable, uuid, text, timestamp, numeric, integer, index, boolean,
} from 'drizzle-orm/pg-core'
import { shops } from './shops.js'
import { workers } from './workers.js'

// ─── Suppliers ────────────────────────────────────────────────
export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  whatsapp: text('whatsapp'),
  address: text('address'),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Fabrics / Inventory ──────────────────────────────────────
export const fabrics = pgTable('fabrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id').references(() => suppliers.id),

  name: text('name').notNull(),
  colour: text('colour'),
  material: text('material'), // e.g. 'cotton', 'silk', 'wool', 'polyester'
  pattern: text('pattern'),  // e.g. 'plain', 'stripe', 'check', 'print'
  widthCm: numeric('width_cm', { precision: 5, scale: 1 }),

  // Stock management
  yardsInStock: numeric('yards_in_stock', { precision: 8, scale: 2 }).notNull().default('0'),
  lowStockThreshold: numeric('low_stock_threshold', { precision: 8, scale: 2 }).notNull().default('5'),
  costPerYard: numeric('cost_per_yard', { precision: 10, scale: 2 }),
  currency: text('currency').notNull().default('USD'),

  // R2 image key for fabric swatch photo
  imageKey: text('image_key'),

  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  shopIdx: index('fabrics_shop_idx').on(table.shopId),
}))

// ─── Fabric Stock Movements ───────────────────────────────────
// Audit log of all stock changes
export const fabricStockMovements = pgTable('fabric_stock_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  fabricId: uuid('fabric_id').notNull().references(() => fabrics.id, { onDelete: 'cascade' }),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  recordedBy: uuid('recorded_by').references(() => workers.id),
  movementType: text('movement_type').notNull(), // 'purchase' | 'usage' | 'adjustment' | 'waste'
  yardsChange: numeric('yards_change', { precision: 8, scale: 2 }).notNull(),
  totalCost: numeric('total_cost', { precision: 10, scale: 2 }),
  notes: text('notes'),
  orderId: uuid('order_id'), // if used on a specific order
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Appointments ─────────────────────────────────────────────
export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').references(() => shops.id),
  orderId: uuid('order_id'),
  assignedTo: uuid('assigned_to').references(() => workers.id),
  title: text('title').notNull(),
  notes: text('notes'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  googleEventId: text('google_event_id'),
  clientNotifiedAt: timestamp('client_notified_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  shopDateIdx: index('appointments_shop_date_idx').on(table.shopId, table.startsAt),
}))
