import type {
  FieldDefinition,
  ValidationResult,
} from '@stitchbook/types'

// ─── System validation rules ──────────────────────────────────
// These run on every measurement save. Results with severity 'error'
// must be resolved before saving. 'warning' and 'info' are dismissible.

interface ValidationContext {
  bodyValues: Record<string, number | string>
  easeValues: Record<string, number>
  fields: FieldDefinition[]
  previousBodyValues?: Record<string, number | string>
  largeChangeThresholdCm?: number
  sessionDate?: Date
  freshnessDays?: number
}

export function validateMeasurements(ctx: ValidationContext): ValidationResult[] {
  const results: ValidationResult[] = []
  const { bodyValues, easeValues, fields, previousBodyValues, largeChangeThresholdCm = 5 } = ctx

  // ── Rule 1: Required fields present ────────────────────────
  for (const field of fields) {
    if (field.required && field.layer === 'L1') {
      const val = bodyValues[field.key]
      if (val === undefined || val === null || val === '') {
        results.push({
          severity: 'error',
          fieldKey: field.key,
          message: `${field.label} is required`,
          code: 'FIELD_REQUIRED',
        })
      }
    }
  }

  // ── Rule 2: No zero or negative values ─────────────────────
  for (const [key, val] of Object.entries(bodyValues)) {
    if (typeof val === 'number' && val <= 0) {
      const field = fields.find(f => f.key === key)
      results.push({
        severity: 'error',
        fieldKey: key,
        message: `${field?.label ?? key} must be greater than zero`,
        code: 'VALUE_NOT_POSITIVE',
      })
    }
  }

  // ── Rule 3: Field min/max validation ───────────────────────
  for (const field of fields) {
    const val = bodyValues[field.key]
    if (typeof val !== 'number') continue
    if (field.validation?.min !== undefined && val < field.validation.min) {
      results.push({
        severity: 'error',
        fieldKey: field.key,
        message: `${field.label} (${val}) is below minimum (${field.validation.min})`,
        code: 'VALUE_BELOW_MIN',
      })
    }
    if (field.validation?.max !== undefined && val > field.validation.max) {
      results.push({
        severity: 'error',
        fieldKey: field.key,
        message: `${field.label} (${val}) exceeds maximum (${field.validation.max})`,
        code: 'VALUE_ABOVE_MAX',
      })
    }
  }

  // ── Rule 4: Hip >= Waist (if both present) ──────────────────
  const hip = Number(bodyValues['hip_body'] ?? bodyValues['hip_circumference'])
  const waist = Number(bodyValues['waist_body'] ?? bodyValues['waist_circumference'])
  if (!isNaN(hip) && !isNaN(waist) && hip > 0 && waist > 0 && hip < waist) {
    results.push({
      severity: 'error',
      fieldKey: null,
      message: 'Hip circumference cannot be less than waist circumference',
      code: 'HIP_LESS_THAN_WAIST',
    })
  }

  // ── Rule 5: Large change from previous session ─────────────
  if (previousBodyValues) {
    for (const [key, curr] of Object.entries(bodyValues)) {
      const prev = previousBodyValues[key]
      if (typeof curr !== 'number' || typeof prev !== 'number') continue
      const delta = Math.abs(curr - prev)
      if (delta >= largeChangeThresholdCm) {
        const field = fields.find(f => f.key === key)
        results.push({
          severity: 'warning',
          fieldKey: key,
          message: `${field?.label ?? key} changed by ${delta.toFixed(1)} cm since last session`,
          code: 'LARGE_CHANGE',
        })
      }
    }
  }

  // ── Rule 6: Chest-waist differential check ─────────────────
  const chest = Number(bodyValues['chest_body'] ?? bodyValues['bust_body'])
  if (!isNaN(chest) && !isNaN(waist) && chest > 0 && waist > 0) {
    const diff = chest - waist
    if (diff < 4) {
      results.push({
        severity: 'warning',
        fieldKey: null,
        message: `Chest-waist differential is unusually small (${diff.toFixed(1)} cm). Please confirm these measurements are correct.`,
        code: 'CHEST_WAIST_SMALL_DIFF',
      })
    }
    if (diff > 30) {
      results.push({
        severity: 'warning',
        fieldKey: null,
        message: `Chest-waist differential is unusually large (${diff.toFixed(1)} cm). Please confirm these measurements are correct.`,
        code: 'CHEST_WAIST_LARGE_DIFF',
      })
    }
  }

  // ── Rule 7: Sleeve vs back length ratio ────────────────────
  const sleeve = Number(bodyValues['sleeve_length'])
  const backLength = Number(bodyValues['back_length'])
  if (!isNaN(sleeve) && !isNaN(backLength) && sleeve > 0 && backLength > 0) {
    if (sleeve < backLength * 1.3) {
      results.push({
        severity: 'warning',
        fieldKey: 'sleeve_length',
        message: 'Sleeve length is shorter than expected relative to back length. Please verify.',
        code: 'SLEEVE_BACK_RATIO',
      })
    }
  }

  // ── Rule 8: Low ease advisory ──────────────────────────────
  const chestEase = easeValues['chest_ease']
  if (chestEase !== undefined && chestEase < 3) {
    results.push({
      severity: 'info',
      fieldKey: 'chest_ease',
      message: `Chest ease of ${chestEase} cm is very low. This will produce a very fitted garment.`,
      code: 'LOW_EASE',
    })
  }

  return results
}

// ─── Filter results by severity ───────────────────────────────
export function getErrors(results: ValidationResult[]): ValidationResult[] {
  return results.filter(r => r.severity === 'error')
}

export function getWarnings(results: ValidationResult[]): ValidationResult[] {
  return results.filter(r => r.severity === 'warning')
}

export function hasErrors(results: ValidationResult[]): boolean {
  return results.some(r => r.severity === 'error')
}
