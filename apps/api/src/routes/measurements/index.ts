import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  db, clients, measurementSessions, garmentTemplates,
} from '@stitchbook/db'
import { eq, and, desc } from 'drizzle-orm'
import {
  validateMeasurements, computeCutValues, computeDiff,
  isMeasurementStale, calculateYardage,
} from '@stitchbook/utils'
import {
  fromZod,
  successEnvelope,
  listEnvelope,
  responses,
  errorResponses,
} from '../../lib/schema.js'

const CreateSessionSchema = z.object({
  clientId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  sessionType: z.enum(['garment_specific', 'general_remeasure']),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  unit: z.enum(['cm', 'in', 'in_frac']).default('cm'),
  easeProfile: z.enum(['fitted', 'regular', 'relaxed']).default('regular'),
  bodyValues: z.record(z.string(), z.union([z.number(), z.string()])).default({}),
  easeValues: z.record(z.string(), z.number()).default({}),
  cutValuesOverride: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
  postureNotes: z.record(z.string(), z.unknown()).default({}),
  fitNotesText: z.string().optional(),
  isPinned: z.boolean().default(false),
  pinLabel: z.string().optional(),
  // Optional: atomically link the new session to an existing garment item.
  // Verified against shopId before linking to prevent cross-shop IDOR.
  linkToGarmentItemId: z.string().uuid().optional(),
})

const TemplateSchema = z.object({
  id: z.string().uuid(),
  shopId: z.string().uuid().nullable(),
  name: z.string(),
  category: z.string(),
  isSystem: z.boolean(),
  fields: z.array(z.record(z.string(), z.any())),
  yardageFormula: z.record(z.string(), z.any()).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const WorkerNameSchema = z.object({ name: z.string() })

const MeasurementSessionSchema = z.object({
  id: z.string().uuid(),
  shopId: z.string().uuid(),
  clientId: z.string().uuid(),
  takenBy: z.string().uuid().nullable(),
  templateId: z.string().uuid().nullable(),
  sessionType: z.string(),
  sessionDate: z.string(),
  unit: z.string(),
  easeProfile: z.string(),
  bodyValues: z.record(z.string(), z.union([z.number(), z.string()])),
  easeValues: z.record(z.string(), z.number()),
  cutValues: z.record(z.string(), z.union([z.number(), z.string()])),
  postureNotes: z.record(z.string(), z.unknown()),
  fitNotesText: z.string().nullable(),
  isPinned: z.boolean(),
  pinLabel: z.string().nullable(),
  sbSyncedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  template: TemplateSchema.nullable(),
  takenByWorker: WorkerNameSchema.nullable(),
  client: z.object({ id: z.string().uuid(), name: z.string(), preferredUnit: z.string() }).nullable(),
})

const ClientIdParamsSchema = z.object({ clientId: z.string().uuid() })
const SessionIdParamsSchema = z.object({ id: z.string().uuid() })
const SessionDiffParamsSchema = z.object({ sessionIdA: z.string().uuid(), sessionIdB: z.string().uuid() })
const YardageQuerySchema = z.object({
  fabricWidthCm: z.coerce.number().optional(),
  isPatternedFabric: z.enum(['true', 'false']).optional(),
  includeLining: z.enum(['true', 'false']).optional(),
})

const ValidationResultSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  fieldKey: z.string().nullable(),
  message: z.string(),
  code: z.string(),
})

const measurementResponses = {
  templates: responses(listEnvelope(fromZod(TemplateSchema, { title: 'GarmentTemplate' }), { title: 'List Templates Response' })),
  clientSessions: responses(listEnvelope(fromZod(MeasurementSessionSchema, { title: 'MeasurementSession' }), { title: 'List Client Sessions Response' })),
  sessionDetail: responses(successEnvelope(fromZod(MeasurementSessionSchema, { title: 'MeasurementSession' }), { title: 'Session Detail Response' })),
  validate: responses(successEnvelope(fromZod(z.object({ results: z.array(ValidationResultSchema), hasErrors: z.boolean() }), { title: 'MeasurementValidation' }), { title: 'Validate Measurements Response' })),
  create: responses(successEnvelope(fromZod(MeasurementSessionSchema, { title: 'MeasurementSession' }), { title: 'Create Session Response' }), { statuses: [201] }),
  diff: responses(successEnvelope(fromZod(z.object({
    sessionA: z.object({ id: z.string().uuid(), date: z.string() }),
    sessionB: z.object({ id: z.string().uuid(), date: z.string() }),
    diff: z.array(z.record(z.string(), z.any())),
    hasLargeChanges: z.boolean(),
  }), { title: 'MeasurementDiff' }), { title: 'Session Diff Response' })),
  yardage: responses(successEnvelope(fromZod(z.record(z.string(), z.any()), { title: 'YardageEstimate' }), { title: 'Yardage Estimate Response' })),
  freshness: responses(successEnvelope(fromZod(z.object({
    hasSession: z.literal(true),
    lastSessionDate: z.string(),
    lastSessionId: z.string().uuid(),
    isStale: z.boolean(),
    freshnessDays: z.number(),
    warningThresholdDays: z.number(),
  }).or(z.object({ hasSession: z.literal(false) })), { title: 'MeasurementFreshness' }), { title: 'Measurement Freshness Response' })),
}

export async function measurementRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // ── LIST all garment templates ───────────────────────────────
  app.get('/templates', { schema: { summary: 'List garment templates', description: 'System templates plus any owned by the current shop.', response: measurementResponses.templates } }, async (request) => {
    const { shopId } = request.auth
    const { or } = await import('drizzle-orm')
    const templates = await db.query.garmentTemplates.findMany({
      where: or(
        eq(garmentTemplates.isSystem, true),
        eq(garmentTemplates.shopId, shopId)
      ),
      orderBy: [garmentTemplates.category, garmentTemplates.name],
    })
    return { success: true, data: templates }
  })

  // ── LIST sessions for a client ──────────────────────────────
  app.get('/client/:clientId', { schema: { summary: "List a client's measurement sessions", params: fromZod(ClientIdParamsSchema), response: measurementResponses.clientSessions } }, async (request) => {
    const { clientId } = request.params as { clientId: string }
    const { shopId } = request.auth

    // Verify client belongs to shop
    const client = await db.query.clients.findFirst({
      where: and(eq(clients.id, clientId), eq(clients.shopId, shopId)),
      columns: { id: true },
    })
    if (!client) throw { statusCode: 404, message: 'Client not found' }

    const sessions = await db.query.measurementSessions.findMany({
      where: and(
        eq(measurementSessions.clientId, clientId),
        eq(measurementSessions.shopId, shopId)
      ),
      orderBy: [desc(measurementSessions.sessionDate)],
      with: {
        template: { columns: { name: true, category: true } },
        takenByWorker: { columns: { name: true } },
      },
    })

    return { success: true, data: sessions }
  })

  // ── GET single session ───────────────────────────────────────
  app.get('/:id', { schema: { summary: 'Get a single measurement session', params: fromZod(SessionIdParamsSchema), response: measurementResponses.sessionDetail } }, async (request) => {
    const { id } = request.params as { id: string }
    const { shopId } = request.auth

    const session = await db.query.measurementSessions.findFirst({
      where: and(
        eq(measurementSessions.id, id),
        eq(measurementSessions.shopId, shopId)
      ),
      with: {
        template: true,
        takenByWorker: { columns: { name: true } },
        client: { columns: { id: true, name: true, preferredUnit: true } },
      },
    })

    if (!session) throw { statusCode: 404, message: 'Session not found' }
    return { success: true, data: session }
  })

  // ── VALIDATE measurements (pre-save) ───────────────────────
  app.post('/validate', { schema: { summary: 'Validate measurements before saving', description: 'Runs field-level and large-change checks against the most recent prior session; does not persist anything.', body: fromZod(CreateSessionSchema), response: measurementResponses.validate } }, async (request) => {
    const body = CreateSessionSchema.parse(request.body)
    const { shopId } = request.auth

    // Load template fields for validation
    let fields: any[] = []
    if (body.templateId) {
      const template = await db.query.garmentTemplates.findFirst({
        where: eq(garmentTemplates.id, body.templateId),
        columns: { fields: true },
      })
      fields = template?.fields ?? []
    }

    // Load previous session for diff/large-change checks
    const prevSession = await db.query.measurementSessions.findFirst({
      where: and(
        eq(measurementSessions.clientId, body.clientId),
        eq(measurementSessions.shopId, shopId)
      ),
      orderBy: [desc(measurementSessions.sessionDate)],
      columns: { bodyValues: true },
    })

    const results = validateMeasurements({
      bodyValues: body.bodyValues,
      easeValues: body.easeValues,
      fields,
      ...(prevSession?.bodyValues ? { previousBodyValues: prevSession.bodyValues as Record<string, number> } : {}),
      largeChangeThresholdCm: 5,
    })

    return { success: true, data: { results, hasErrors: results.some(r => r.severity === 'error') } }
  })

  // ── CREATE session ───────────────────────────────────────────
  app.post('/', { schema: { summary: 'Create a measurement session', description: 'Auto-computes cut values from the template formula when possible. Optionally links to an existing garment item and auto-advances its order from booked to measured.', body: fromZod(CreateSessionSchema), response: measurementResponses.create } }, async (request, reply) => {
    const body = CreateSessionSchema.parse(request.body)
    const { shopId, workerId } = request.auth

    // Verify client
    const client = await db.query.clients.findFirst({
      where: and(eq(clients.id, body.clientId), eq(clients.shopId, shopId)),
      columns: { id: true },
    })
    if (!client) throw { statusCode: 404, message: 'Client not found' }

    // Load template for formula-based cut computation
    let computedCutValues = body.cutValuesOverride ?? {}
    if (body.templateId && Object.keys(body.bodyValues).length > 0) {
      const template = await db.query.garmentTemplates.findFirst({
        where: eq(garmentTemplates.id, body.templateId),
        columns: { fields: true },
      })
      if (template?.fields) {
        const autoCut = computeCutValues(
          body.bodyValues,
          body.easeValues,
          template.fields,
          body.cutValuesOverride
        )
        computedCutValues = { ...autoCut, ...body.cutValuesOverride }
      }
    }

    const [session] = await db.insert(measurementSessions).values({
      shopId,
      clientId: body.clientId,
      takenBy: workerId,
      templateId: body.templateId,
      sessionType: body.sessionType,
      sessionDate: body.sessionDate ?? new Date().toISOString().split('T')[0],
      unit: body.unit,
      easeProfile: body.easeProfile,
      bodyValues: body.bodyValues as Record<string, string | number>,
      easeValues: body.easeValues as Record<string, number>,
      cutValues: computedCutValues as Record<string, string | number>,
      postureNotes: body.postureNotes as Record<string, unknown>,
      fitNotesText: body.fitNotesText,
      isPinned: body.isPinned,
      pinLabel: body.pinLabel,
    } as any).returning()

    // Update client posture profile if posture notes provided
    if (Object.keys(body.postureNotes).length > 0) {
      await db
        .update(clients)
        .set({
          postureProfile: body.postureNotes,
          updatedAt: new Date(),
        })
        .where(eq(clients.id, body.clientId))
    }

    reply.code(201)

    // If linkToGarmentItemId is provided, atomically attach this session
    if (body.linkToGarmentItemId) {
      const { garmentItems } = await import('@stitchbook/db')
      const item = await db.query.garmentItems.findFirst({
        where: and(eq(garmentItems.id, body.linkToGarmentItemId), eq((garmentItems as any).shopId, shopId)),
        columns: { id: true },
      })
      if (item) {
        await db.update(garmentItems)
          .set({ measurementSessionId: session!.id, updatedAt: new Date() })
          .where(eq(garmentItems.id, body.linkToGarmentItemId))
        // Auto-advance order status if it was still in booked state
        const { orders } = await import('@stitchbook/db')
        const garment = await db.query.garmentItems.findFirst({ where: eq(garmentItems.id, body.linkToGarmentItemId), columns: { orderId: true } })
        if (garment?.orderId) {
          const order = await db.query.orders.findFirst({ where: eq(orders.id, garment.orderId), columns: { status: true, id: true } })
          if (order?.status === 'booked') {
            await db.update(orders).set({ status: 'measured', updatedAt: new Date() }).where(eq(orders.id, order.id))
          }
        }
      }
    }
    return { success: true, data: session }
  })

  // ── GET diff between two sessions ─────────────────────────────────
  app.get('/diff/:sessionIdA/:sessionIdB', { schema: { summary: 'Diff two measurement sessions', params: fromZod(SessionDiffParamsSchema), response: measurementResponses.diff } }, async (request) => {
    const { sessionIdA, sessionIdB } = request.params as {
      sessionIdA: string; sessionIdB: string
    }
    const { shopId } = request.auth

    const [sessionA, sessionB] = await Promise.all([
      db.query.measurementSessions.findFirst({
        where: and(eq(measurementSessions.id, sessionIdA), eq(measurementSessions.shopId, shopId)),
        with: { template: { columns: { fields: true } } },
      }),
      db.query.measurementSessions.findFirst({
        where: and(eq(measurementSessions.id, sessionIdB), eq(measurementSessions.shopId, shopId)),
      }),
    ])

    if (!sessionA || !sessionB) throw { statusCode: 404, message: 'Session not found' }

    // Build field label map
    const fieldLabels: Record<string, string> = {}
    for (const field of (sessionA.template?.fields ?? [])) {
      fieldLabels[field.key] = field.label
    }

    const diff = computeDiff(
      sessionA.bodyValues as Record<string, number>,
      sessionB.bodyValues as Record<string, number>,
      5,
      fieldLabels
    )

    return {
      success: true,
      data: {
        sessionA: { id: sessionA.id, date: sessionA.sessionDate },
        sessionB: { id: sessionB.id, date: sessionB.sessionDate },
        diff,
        hasLargeChanges: diff.some(d => d.isLargeChange),
      },
    }
  })

  // ── GET yardage estimate for a session ──────────────────────
  app.get('/:id/yardage', { schema: { summary: 'Estimate fabric yardage for a session', description: '422 if the template has no yardage formula, or if required measurements are missing.', params: fromZod(SessionIdParamsSchema), querystring: fromZod(YardageQuerySchema), response: measurementResponses.yardage } }, async (request) => {
    const { id } = request.params as { id: string }
    const { shopId } = request.auth
    const query = request.query as {
      fabricWidthCm?: string
      isPatternedFabric?: string
      includeLining?: string
    }

    const session = await db.query.measurementSessions.findFirst({
      where: and(eq(measurementSessions.id, id), eq(measurementSessions.shopId, shopId)),
      with: { template: { columns: { yardageFormula: true } } },
    })
    if (!session) throw { statusCode: 404, message: 'Session not found' }
    if (!session.template?.yardageFormula) {
      throw { statusCode: 422, message: 'This template does not have a yardage formula' }
    }

    const estimate = calculateYardage(
      session.template.yardageFormula,
      session.bodyValues as Record<string, number>,
      {
        fabricWidthCm: query.fabricWidthCm ? Number(query.fabricWidthCm) : undefined,
        isPatternedFabric: query.isPatternedFabric === 'true',
        includeLining: query.includeLining === 'true',
      } as any
    )

    if (!estimate) {
      throw { statusCode: 422, message: 'Could not calculate yardage — missing measurements' }
    }

    return { success: true, data: estimate }
  })

  // ── CHECK freshness for a client ────────────────────────────────
  app.get('/freshness/:clientId', { schema: { summary: "Check a client's measurement freshness", description: 'Compares the most recent session date against the shop\'s defaultFreshnessDays (fallback 180).', params: fromZod(ClientIdParamsSchema), response: measurementResponses.freshness } }, async (request) => {
    const { clientId } = request.params as { clientId: string }
    const { shopId } = request.auth

    const [session, shop] = await Promise.all([
      db.query.measurementSessions.findFirst({
        where: and(
          eq(measurementSessions.clientId, clientId),
          eq(measurementSessions.shopId, shopId)
        ),
        orderBy: [desc(measurementSessions.sessionDate)],
        columns: { sessionDate: true, id: true },
      }),
      db.query.shops.findFirst({
        where: eq((await import('@stitchbook/db')).shops.id, shopId),
        columns: { defaultFreshnessDays: true },
      }),
    ])

    if (!session) return { success: true, data: { hasSession: false } }

    const freshnessDays = shop?.defaultFreshnessDays ?? 180
    const isStale = isMeasurementStale(session.sessionDate, freshnessDays)

    return {
      success: true,
      data: {
        hasSession: true,
        lastSessionDate: session.sessionDate,
        lastSessionId: session.id,
        isStale,
        freshnessDays,
        warningThresholdDays: Math.floor(freshnessDays * 0.75),
      },
    }
  })
}
