import type { YardageEstimate } from '@stitchbook/types'

interface YardageFormula {
  expression: string
  patternMatchFactor: number
  liningFactor?: number
  variables: string[]
}

// ─── Fabric width defaults (cm) ───────────────────────────────
export const STANDARD_FABRIC_WIDTHS = {
  narrow: 90,
  standard: 115,
  wide: 150,
  extra_wide: 180,
} as const

// ─── Calculate yardage estimate ───────────────────────────────
export function calculateYardage(
  formula: YardageFormula,
  measurements: Record<string, number | string>,
  options: {
    fabricWidthCm?: number
    isPatternedFabric?: boolean
    includeLining?: boolean
    includeInterlining?: boolean
  } = {}
): YardageEstimate | null {
  const {
    fabricWidthCm = STANDARD_FABRIC_WIDTHS.wide,
    isPatternedFabric = false,
    includeLining = false,
    includeInterlining = false,
  } = options

  // Build context for the formula
  const context: Record<string, number> = {
    fabric_width: fabricWidthCm,
  }
  for (const [key, val] of Object.entries(measurements)) {
    if (typeof val === 'number') context[key] = val
  }

  // Check all required variables are present
  for (const varName of formula.variables) {
    if (varName !== 'fabric_width' && !(varName in context)) {
      return null // Missing required measurement
    }
  }

  // Evaluate the formula
  let expr = formula.expression
  for (const [key, val] of Object.entries(context)) {
    expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(val))
  }

  let mainFabricMetres: number
  try {
    if (!/^[\d\s+\-*/.()]+$/.test(expr)) return null
    // eslint-disable-next-line no-new-func
    mainFabricMetres = Function(`"use strict"; return (${expr})`)()
  } catch {
    return null
  }

  if (!isFinite(mainFabricMetres) || mainFabricMetres <= 0) return null

  // Apply pattern match factor
  const patternFactor = isPatternedFabric
    ? formula.patternMatchFactor
    : Math.max(1.0, formula.patternMatchFactor - 0.1)

  const mainFabricWithWaste = mainFabricMetres * patternFactor

  // Convert metres to yards (1 metre = 1.09361 yards)
  const mainFabricYards = Math.ceil(mainFabricWithWaste * 1.09361 * 10) / 10

  const liningYards = includeLining && formula.liningFactor
    ? Math.ceil(mainFabricYards * formula.liningFactor * 10) / 10
    : undefined

  const interlingYards = includeInterlining
    ? Math.ceil(mainFabricYards * 0.4 * 10) / 10
    : undefined

  const totalYards = mainFabricYards + (liningYards ?? 0) + (interlingYards ?? 0)

  const estimate: YardageEstimate = {
    mainFabricYards,
    totalYards: Math.ceil(totalYards * 10) / 10,
    fabricWidthCm,
    includesPatternMatch: isPatternedFabric,
  }

  if (liningYards !== undefined) estimate.liningYards = liningYards
  if (interlingYards !== undefined) estimate.interlingYards = interlingYards

  return estimate
}

// ─── Format yardage for display ───────────────────────────────
export function formatYardage(yards: number): string {
  if (yards < 1) return `${Math.round(yards * 4) / 4} yards`
  const whole = Math.floor(yards)
  const frac = yards - whole
  if (frac < 0.125) return `${whole} yards`
  if (frac < 0.375) return `${whole}¼ yards`
  if (frac < 0.625) return `${whole}½ yards`
  if (frac < 0.875) return `${whole}¾ yards`
  return `${whole + 1} yards`
}
