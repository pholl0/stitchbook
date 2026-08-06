import type { MeasurementValues, MeasurementDiff, Unit } from '@stitchbook/types'

// ─── Unit conversion ──────────────────────────────────────────
export function cmToInches(cm: number): number {
  return Math.round((cm / 2.54) * 8) / 8 // round to nearest 1/8 inch
}

export function inchesToCm(inches: number): number {
  return Math.round(inches * 2.54 * 10) / 10
}

export function convertValue(value: number, from: Unit, to: Unit): number {
  if (from === to) return value
  if (from === 'cm' && (to === 'in' || to === 'in_frac')) return cmToInches(value)
  if ((from === 'in' || from === 'in_frac') && to === 'cm') return inchesToCm(value)
  return value
}

export function formatMeasurement(value: number, unit: Unit): string {
  if (unit === 'cm') return `${value.toFixed(1)} cm`
  if (unit === 'in') return `${value.toFixed(2)}"`

  // in_frac — display as whole number + fraction
  const whole = Math.floor(value)
  const frac = value - whole
  const eighths = Math.round(frac * 8)
  if (eighths === 0) return `${whole}"`
  if (eighths === 8) return `${whole + 1}"`

  const fractions: Record<number, string> = {
    1: '⅛', 2: '¼', 3: '⅜', 4: '½', 5: '⅝', 6: '¾', 7: '⅞',
  }
  return `${whole}${fractions[eighths] ?? ''}"`
}

// ─── L3 cut value calculation ─────────────────────────────────
// Evaluates a simple formula string like "chest_body + chest_ease + posture_shoulder_drop"
export function evaluateFormula(
  formula: string,
  context: Record<string, number | string>
): number | null {
  try {
    // Build a safe expression with only known variables
    let expr = formula
    const numericContext: Record<string, number> = {}

    for (const [key, val] of Object.entries(context)) {
      if (typeof val === 'number') {
        numericContext[key] = val
      }
    }

    // Replace variable names with their values
    for (const [key, val] of Object.entries(numericContext)) {
      expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(val))
    }

    // Only allow safe math operations
    if (!/^[\d\s+\-*/.()]+$/.test(expr)) return null

    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)()
    return typeof result === 'number' && isFinite(result)
      ? Math.round(result * 10) / 10
      : null
  } catch {
    return null
  }
}

// ─── Compute all L3 cut values from L1+L2 ────────────────────
export function computeCutValues(
  bodyValues: Record<string, number | string>,
  easeValues: Record<string, number>,
  fields: Array<{ key: string; calcFormula?: string; layer: string }>,
  overrides?: Record<string, number | string>
): Record<string, number | string> {
  const context = { ...bodyValues, ...easeValues, ...(overrides ?? {}) }
  const cutValues: Record<string, number | string> = {}

  for (const field of fields) {
    if (field.layer !== 'L3') continue
    if (overrides && field.key in overrides) {
      cutValues[field.key] = overrides[field.key]!
      continue
    }
    if (field.calcFormula) {
      const result = evaluateFormula(field.calcFormula, context)
      if (result !== null) cutValues[field.key] = result
    }
  }

  return cutValues
}

// ─── Compute measurement diff between two sessions ───────────
export function computeDiff(
  previous: Record<string, number | string>,
  current: Record<string, number | string>,
  largeChangeThresholdCm = 5,
  fieldLabels: Record<string, string> = {}
): MeasurementDiff[] {
  const allKeys = new Set([...Object.keys(previous), ...Object.keys(current)])
  const diffs: MeasurementDiff[] = []

  for (const key of allKeys) {
    const prev = previous[key] ?? null
    const curr = current[key] ?? null

    if (prev === curr) continue

    const prevNum = typeof prev === 'number' ? prev : null
    const currNum = typeof curr === 'number' ? curr : null
    const delta = prevNum !== null && currNum !== null ? currNum - prevNum : null

    diffs.push({
      fieldKey: key,
      label: fieldLabels[key] ?? key,
      previous: prev,
      current: curr,
      delta,
      isLargeChange: delta !== null && Math.abs(delta) >= largeChangeThresholdCm,
    })
  }

  return diffs.sort((a, b) => {
    // Large changes first
    if (a.isLargeChange && !b.isLargeChange) return -1
    if (!a.isLargeChange && b.isLargeChange) return 1
    return a.fieldKey.localeCompare(b.fieldKey)
  })
}

// ─── Check measurement freshness ─────────────────────────────
export function isMeasurementStale(
  sessionDate: Date | string,
  freshnessDays: number
): boolean {
  const date = typeof sessionDate === 'string' ? new Date(sessionDate) : sessionDate
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - freshnessDays)
  return date < cutoff
}

export function getMeasurementAge(sessionDate: Date | string): {
  days: number
  label: string
} {
  const date = typeof sessionDate === 'string' ? new Date(sessionDate) : sessionDate
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))

  if (days === 0) return { days, label: 'Today' }
  if (days === 1) return { days, label: 'Yesterday' }
  if (days < 30) return { days, label: `${days} days ago` }
  if (days < 365) return { days, label: `${Math.floor(days / 30)} months ago` }
  return { days, label: `${Math.floor(days / 365)} year(s) ago` }
}
