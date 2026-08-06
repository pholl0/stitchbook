// ─── Garment field definitions ────────────────────────────────
export type FieldDefinition = {
  key: string
  label: string
  layer: 'L1' | 'L2' | 'L3'
  type: 'decimal' | 'enum' | 'text' | 'boolean'
  required: boolean
  order: number
  defaultValue?: string | number | boolean | null
  enumOptions?: string[]
  calcFormula?: string
  helpAsset?: string
  validation?: {
    min?: number
    max?: number
    pattern?: string
  }
  selfMeasurable: boolean
  helperRequired: boolean
}

// ─── Plan & Role ──────────────────────────────────────────────
export type PlanTier = 'solo' | 'boutique' | 'atelier'
export type WorkerRole = 'owner' | 'manager' | 'tailor' | 'cutter' | 'super_admin'

// ─── Units ────────────────────────────────────────────────────
export type Unit = 'cm' | 'in' | 'in_frac'
export type EaseProfile = 'fitted' | 'regular' | 'relaxed'

// ─── Order ────────────────────────────────────────────────────
export type OrderStatus =
  | 'booked'
  | 'measured'
  | 'cutting'
  | 'in_progress'
  | 'fitting'
  | 'final_adjustments'
  | 'ready'
  | 'delivered'
  | 'cancelled'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  booked:            'Order Placed',
  measured:          'Being Measured',
  cutting:           'Fabric Being Cut',
  in_progress:       'Being Made',
  fitting:           'Fitting Scheduled',
  final_adjustments: 'Final Adjustments',
  ready:             'Ready to Collect',
  delivered:         'Delivered',
  cancelled:         'Cancelled',
}

export const ORDER_STATUS_PIPELINE: OrderStatus[] = [
  'booked', 'measured', 'cutting', 'in_progress',
  'fitting', 'final_adjustments', 'ready', 'delivered',
]

// ─── Measurement ──────────────────────────────────────────────
export type MeasurementLayer = 'L1' | 'L2' | 'L3'
export type SessionType = 'garment_specific' | 'general_remeasure'

export interface MeasurementValues {
  body: Record<string, number | string>
  ease: Record<string, number>
  cut: Record<string, number | string>
}

export interface PostureProfile {
  swayback?: boolean
  swayback_degree?: 'mild' | 'moderate' | 'pronounced'
  shoulder_drop_R?: number   // positive = right higher, negative = left higher
  forward_head?: boolean
  prominent_shoulder_blades?: boolean
  uneven_hips?: boolean
  full_seat?: boolean
  flat_seat?: boolean
  lordosis?: boolean
  round_back?: boolean
  notes?: string
}

export interface MeasurementDiff {
  fieldKey: string
  label: string
  previous: number | string | null
  current: number | string | null
  delta: number | null
  isLargeChange: boolean
}

// ─── Validation ───────────────────────────────────────────────
export type ValidationSeverity = 'error' | 'warning' | 'info'

export interface ValidationResult {
  severity: ValidationSeverity
  fieldKey: string | null   // null = cross-field validation
  message: string
  code: string
}

// ─── Garment ──────────────────────────────────────────────────
export type GarmentCategory =
  | 'menswear'
  | 'womenswear'
  | 'bridal'
  | 'ethnic_west_african'
  | 'ethnic_south_asian'
  | 'ethnic_middle_eastern'
  | 'childrens'
  | 'custom'

export interface YardageEstimate {
  mainFabricYards: number
  liningYards?: number
  interlingYards?: number
  totalYards: number
  fabricWidthCm: number
  includesPatternMatch: boolean
}

// ─── Fitting ──────────────────────────────────────────────────
export type FitIssueCategory = 'silhouette' | 'shoulder' | 'back' | 'sleeve' | 'length' | 'other'

export interface FitIssue {
  category: FitIssueCategory
  issue: string
  severity: 'minor' | 'moderate' | 'significant'
  adjustmentMade: string
  amountCm?: number
}

// ─── Portal ───────────────────────────────────────────────────
export type PortalTokenType = 'measure_invite' | 'approval' | 'order_deeplink'
export type SubmissionStatus = 'pending' | 'reviewed' | 'accepted' | 'rejected'

// ─── Notifications ────────────────────────────────────────────
export type NotificationChannel = 'whatsapp' | 'sms' | 'email' | 'push'

export type NotificationEventType =
  | 'order_status_changed'
  | 'order_ready'
  | 'measurement_invite'
  | 'measurement_submitted'
  | 'measurement_clarification_requested'
  | 'fitting_reminder'
  | 'payment_reminder'
  | 'portal_approval_request'

// ─── API Response shapes ──────────────────────────────────────
export interface ApiSuccess<T> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

// ─── Auth Context ─────────────────────────────────────────────
export interface AuthContext {
  workerId: string
  shopId: string
  role: WorkerRole
  planTier: PlanTier
}

// ─── Supported Languages ──────────────────────────────────────
export type SupportedLocale =
  | 'en' | 'fr' | 'hi' | 'yo' | 'pt'   // Phase 1
  | 'ar' | 'ur' | 'sw' | 'bn' | 'tr' | 'es' | 'ig'  // Phase 3+

export const SUPPORTED_LOCALES: SupportedLocale[] = [
  'en', 'fr', 'hi', 'yo', 'pt',
  'ar', 'ur', 'sw', 'bn', 'tr', 'es', 'ig',
]

export const RTL_LOCALES: SupportedLocale[] = ['ar', 'ur']

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: 'English',
  fr: 'Français',
  hi: 'हिन्दी',
  yo: 'Yorùbá',
  pt: 'Português',
  ar: 'العربية',
  ur: 'اردو',
  sw: 'Kiswahili',
  bn: 'বাংলা',
  tr: 'Türkçe',
  es: 'Español',
  ig: 'Igbo',
}

// ─── Body Type Tags ───────────────────────────────────────────
export const BODY_TYPE_TAGS = [
  'petite', 'tall', 'plus_size', 'athletic',
  'broad_shoulder', 'narrow_shoulder', 'sloped_shoulder',
  'full_bust', 'flat_bust',
  'full_seat', 'flat_seat',
  'wide_hip', 'narrow_hip',
  'long_torso', 'short_torso',
  'long_legs', 'short_legs',
] as const

export type BodyTypeTag = typeof BODY_TYPE_TAGS[number]

// ─── Feature flags per plan tier ─────────────────────────────
export const PLAN_FEATURES: Record<PlanTier, {
  maxClients: number | null
  maxWorkers: number | null
  hasClientPortal: boolean
  hasMeasurementHistory: boolean
  hasFittingSessions: boolean
  hasInventory: boolean
  hasAnalytics: boolean
  hasMultiBranch: boolean
  hasApi: boolean
  hasCustomDomain: boolean
  hasWhiteLabel: boolean
}> = {
  solo: {
    maxClients: 50,
    maxWorkers: 1,
    hasClientPortal: false,
    hasMeasurementHistory: false,
    hasFittingSessions: false,
    hasInventory: false,
    hasAnalytics: false,
    hasMultiBranch: false,
    hasApi: false,
    hasCustomDomain: false,
    hasWhiteLabel: false,
  },
  boutique: {
    maxClients: null,
    maxWorkers: 5,
    hasClientPortal: true,
    hasMeasurementHistory: true,
    hasFittingSessions: true,
    hasInventory: true,
    hasAnalytics: true,
    hasMultiBranch: false,
    hasApi: false,
    hasCustomDomain: false,
    hasWhiteLabel: false,
  },
  atelier: {
    maxClients: null,
    maxWorkers: null,
    hasClientPortal: true,
    hasMeasurementHistory: true,
    hasFittingSessions: true,
    hasInventory: true,
    hasAnalytics: true,
    hasMultiBranch: true,
    hasApi: true,
    hasCustomDomain: true,
    hasWhiteLabel: true,
  },
}
