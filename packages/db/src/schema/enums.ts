import { pgEnum } from 'drizzle-orm/pg-core'

// ─── Plan Tiers ───────────────────────────────────────────────
export const planTierEnum = pgEnum('plan_tier', ['solo', 'boutique', 'atelier'])

// ─── Worker Roles ─────────────────────────────────────────────
export const workerRoleEnum = pgEnum('worker_role', ['owner', 'manager', 'tailor', 'cutter', 'super_admin'])

// ─── Order Status Pipeline ────────────────────────────────────
export const orderStatusEnum = pgEnum('order_status', [
  'booked',
  'measured',
  'cutting',
  'in_progress',
  'fitting',
  'final_adjustments',
  'ready',
  'delivered',
  'cancelled',
])

// ─── Measurement Session Type ─────────────────────────────────
export const sessionTypeEnum = pgEnum('session_type', [
  'garment_specific',
  'general_remeasure',
])

// ─── Measurement Layers ───────────────────────────────────────
export const measurementLayerEnum = pgEnum('measurement_layer', ['L1', 'L2', 'L3'])

// ─── Unit Systems ─────────────────────────────────────────────
export const unitEnum = pgEnum('unit', ['cm', 'in', 'in_frac'])

// ─── Ease Profile ─────────────────────────────────────────────
export const easeProfileEnum = pgEnum('ease_profile', ['fitted', 'regular', 'relaxed'])

// ─── Garment Category ─────────────────────────────────────────
export const garmentCategoryEnum = pgEnum('garment_category', [
  'menswear',
  'womenswear',
  'bridal',
  'ethnic_west_african',
  'ethnic_south_asian',
  'ethnic_middle_eastern',
  'childrens',
  'custom',
])

// ─── Fitting Session Type ─────────────────────────────────────
export const fittingSessionTypeEnum = pgEnum('fitting_session_type', [
  'toile',
  'first_fitting',
  'second_fitting',
  'third_fitting',
  'final_fitting',
])

// ─── Portal Token Type ────────────────────────────────────────
export const portalTokenTypeEnum = pgEnum('portal_token_type', [
  'measure_invite',
  'approval',
  'order_deeplink',
])

// ─── Submission Status ────────────────────────────────────────
export const submissionStatusEnum = pgEnum('submission_status', [
  'pending',
  'reviewed',
  'accepted',
  'rejected',
])

// ─── Notification Channel ─────────────────────────────────────
export const notificationChannelEnum = pgEnum('notification_channel', [
  'whatsapp',
  'sms',
  'email',
  'push',
])

// ─── Payment Method ───────────────────────────────────────────
export const paymentMethodEnum = pgEnum('payment_method', [
  'cash',
  'bank_transfer',
  'card',
  'mobile_money',
  'ussd',
])

// ─── Fit Issue Severity ───────────────────────────────────────
export const fitIssueSeverityEnum = pgEnum('fit_issue_severity', [
  'minor',
  'moderate',
  'significant',
])

// ─── Subscription Status ──────────────────────────────────────
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'unpaid',
])
