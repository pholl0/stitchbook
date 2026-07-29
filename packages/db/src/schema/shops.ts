import {
  pgTable, uuid, text, boolean, timestamp,
  integer, jsonb, unique,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { planTierEnum, subscriptionStatusEnum } from './enums.js'

// ─── Shops ────────────────────────────────────────────────────
// The top-level tenant. Every record in the system belongs to a shop.
export const shops = pgTable('shops', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(), // URL-safe identifier for portal
  currency: text('currency').notNull().default('USD'),
  defaultUnit: text('default_unit').notNull().default('cm'),
  timezone: text('timezone').notNull().default('UTC'),
  defaultFreshnessDays: integer('default_freshness_days').notNull().default(180),
  defaultSeamAllowanceCm: text('default_seam_allowance_cm').notNull().default('1.5'),
  planTier: planTierEnum('plan_tier').notNull().default('solo'),
  isActive: boolean('is_active').notNull().default(true),
  // Contact
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  country: text('country'),
  // Metadata
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Shop Subscriptions ───────────────────────────────────────
export const shopSubscriptions = pgTable('shop_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  paystackCustomerCode: text('paystack_customer_code'),
  paystackSubscriptionCode: text('paystack_subscription_code'),
  status: subscriptionStatusEnum('status').notNull().default('trialing'),
  planTier: planTierEnum('plan_tier').notNull().default('solo'),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Portal Shop Branding ─────────────────────────────────────
export const portalShopBranding = pgTable('portal_shop_branding', {
  id: uuid('id').primaryKey().defaultRandom(),
  shopId: uuid('shop_id').notNull().references(() => shops.id, { onDelete: 'cascade' }).unique(),
  displayName: text('display_name').notNull(),
  tagline: text('tagline'),
  logoKey: text('logo_key'), // R2 object key
  accentColour: text('accent_colour').notNull().default('#b5522a'),
  fontPairing: text('font_pairing').notNull().default('default'), // Atelier only
  customDomain: text('custom_domain'), // Atelier only
  hideStitchbookBranding: boolean('hide_stitchbook_branding').notNull().default(false),
  customCss: text('custom_css'), // Atelier only — sanitised server-side
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
