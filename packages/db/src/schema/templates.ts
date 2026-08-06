import {
  pgTable, uuid, text, boolean, timestamp, jsonb, index,
} from 'drizzle-orm/pg-core'
import { garmentCategoryEnum } from './enums.js'
import { shops } from './shops.js'
import type { FieldDefinition } from '@stitchbook/types'

export type { FieldDefinition } from '@stitchbook/types'

// ─── Garment Templates ────────────────────────────────────────
export const garmentTemplates = pgTable('garment_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  // If shopId is null, this is a system template (read-only)
  shopId: uuid('shop_id').references(() => shops.id, { onDelete: 'cascade' }),
  isSystem: boolean('is_system').notNull().default(false),

  name: text('name').notNull(),
  category: garmentCategoryEnum('category').notNull(),
  gender: text('gender'), // 'M' | 'F' | 'unisex' | null
  culturalRegion: text('cultural_region'), // 'south_asian' | 'west_african' | etc.

  // Ordered array of FieldDefinition objects
  fields: jsonb('fields').$type<FieldDefinition[]>().notNull().default([]),

  // Default ease values: { chest_ease: 6, waist_ease: 3, ... }
  easeDefaults: jsonb('ease_defaults').$type<Record<string, number>>().notNull().default({}),

  // Key identifying which SVG diagram variant to load
  diagramVariant: text('diagram_variant').notNull().default('standard_front'),

  // Formula definition for the yardage estimator
  yardageFormula: jsonb('yardage_formula').$type<{
    expression: string     // e.g. "(jacket_length * 2 + sleeve_length * 2 + 30) / fabric_width"
    patternMatchFactor: number
    liningFactor?: number
    variables: string[]    // field keys used in the expression
  }>(),

  // Whether this template is visible in the community library
  isShared: boolean('is_shared').notNull().default(false),

  usageCount: text('usage_count').notNull().default('0'), // bigint as text for JS safety

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  shopIdx: index('templates_shop_idx').on(table.shopId),
  categoryIdx: index('templates_category_idx').on(table.category),
}))
