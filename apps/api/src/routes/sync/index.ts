import type { FastifyInstance } from 'fastify'
import {
  db, clients, measurementSessions, orders,
  garmentItems, garmentTemplates,
} from '@stitchbook/db'
import { eq, and, gt, sql } from 'drizzle-orm'
import { type JsonSchema, successEnvelope, errorResponses } from '../../lib/schema.js'

// ── WatermelonDB Sync Protocol ────────────────────────────────
// Implements the synchronize() protocol from WatermelonDB.
// Pull: return changes since lastPulledAt
// Push: apply local changes to server

const watermelonTableChangesSchema = (recordTitle: string): JsonSchema => ({
  type: 'object',
  title: `${recordTitle} Changes`,
  description: 'WatermelonDB sync-protocol change set for one local table.',
  properties: {
    created: { type: 'array', items: { type: 'object', additionalProperties: true }, description: `${recordTitle} records created or updated since last_pulled_at` },
    updated: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Reserved for future use — always empty; changes are currently reported as `created`.' },
    deleted: { type: 'array', items: { type: 'string' }, description: 'IDs of records deleted (or soft-deleted) since last_pulled_at.' },
  },
  required: ['created', 'updated', 'deleted'],
  additionalProperties: false,
})

const syncPullResponseSchema: JsonSchema = {
  title: 'Sync Pull Response',
  description: 'Raw response (no success/data envelope) matching the WatermelonDB synchronize() pull contract.',
  type: 'object',
  properties: {
    changes: {
      type: 'object',
      properties: {
        clients: watermelonTableChangesSchema('Client'),
        measurement_sessions: watermelonTableChangesSchema('MeasurementSession'),
        orders: watermelonTableChangesSchema('Order'),
        garment_items: watermelonTableChangesSchema('GarmentItem'),
        garment_templates: watermelonTableChangesSchema('GarmentTemplate'),
      },
      required: ['clients', 'measurement_sessions', 'orders', 'garment_items', 'garment_templates'],
      additionalProperties: false,
    },
    timestamp: { type: 'integer', description: 'Server time (ms since epoch) to pass back as `last_pulled_at` on the next pull.' },
  },
  required: ['changes', 'timestamp'],
  additionalProperties: false,
}

const syncPushResultSchema: JsonSchema = {
  title: 'Sync Push Result',
  type: 'object',
  properties: {
    applied: { type: 'integer', minimum: 0, description: 'Number of records successfully applied.' },
    errors: { type: 'array', items: { type: 'string' }, description: 'One message per record that failed to apply, formatted as `<table> <id>: <error>`.' },
  },
  required: ['applied', 'errors'],
  additionalProperties: false,
}

export async function syncRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // ── PULL — return server changes since lastPulledAt ─────────
  app.get('/api/sync/pull', {
    schema: {
      summary: 'Pull changed records for offline sync',
      description: 'Returns clients, measurement sessions, orders, garment items, and system garment templates changed since `last_pulled_at`, formatted for the WatermelonDB synchronize() protocol.',
      querystring: {
        type: 'object',
        properties: {
          last_pulled_at: { type: 'string', description: 'Milliseconds-since-epoch timestamp from the previous pull. Omit to pull the full dataset.' },
        },
        additionalProperties: false,
      },
      response: {
        200: syncPullResponseSchema,
        ...errorResponses(),
      },
    },
  }, async (request) => {
    const { shopId } = request.auth
    const { last_pulled_at } = request.query as { last_pulled_at?: string }
    const since = last_pulled_at ? new Date(Number(last_pulled_at)) : new Date(0)
    const timestamp = Date.now()

    // Fetch changed records since last sync
    const [
      changedClients,
      deletedClients,
      changedSessions,
      changedOrders,
      changedItems,
      systemTemplates,
    ] = await Promise.all([
      // Updated clients
      db.query.clients.findMany({
        where: and(eq(clients.shopId, shopId), gt(clients.updatedAt, since)),
        columns: {
          id: true, name: true, phone: true, email: true, photoKey: true,
          preferredUnit: true, preferredLanguage: true, timezone: true,
          bodyTypeTags: true, postureProfile: true, internalNotes: true,
          isActive: true, updatedAt: true,
        },
      }),
      // Deleted (inactive) clients
      db.select({ id: clients.id }).from(clients)
        .where(and(
          eq(clients.shopId, shopId),
          eq(clients.isActive, false),
          gt(clients.updatedAt, since)
        )),
      // New/updated measurement sessions
      db.query.measurementSessions.findMany({
        where: and(
          eq(measurementSessions.shopId, shopId),
          gt(measurementSessions.createdAt, since)
        ),
        columns: {
          id: true, clientId: true, shopId: true, takenBy: true,
          templateId: true, sessionType: true, sessionDate: true,
          unit: true, bodyValues: true, easeValues: true, cutValues: true,
          postureNotes: true, fitNotesText: true, easeProfile: true,
          isPinned: true, pinLabel: true, isClientSubmission: true,
          createdAt: true,
        },
        with: { template: { columns: { name: true } } },
      }),
      // Changed orders
      db.query.orders.findMany({
        where: and(eq(orders.shopId, shopId), gt(orders.updatedAt, since)),
        with: { client: { columns: { name: true } } },
      }),
      // Changed garment items
      db.query.garmentItems.findMany({
        where: and(
          eq(garmentItems.shopId, shopId),
          gt(garmentItems.updatedAt, since)
        ),
        with: { template: { columns: { name: true } } },
      }),
      // All system templates (cached — refetch if older than 24h)
      db.query.garmentTemplates.findMany({
        where: eq(garmentTemplates.isSystem, true),
      }),
    ])

    // Format for WatermelonDB sync protocol
    const changes = {
      clients: {
        created: changedClients
          .filter(c => c.isActive && new Date(c.updatedAt) > since)
          .map(mapClientToWatermelon),
        updated: [],
        deleted: deletedClients.map(c => c.id),
      },
      measurement_sessions: {
        created: changedSessions.map(s => ({
          id: s.id,
          server_id: s.id,
          client_id: s.clientId,
          shop_id: s.shopId,
          taken_by: s.takenBy,
          template_id: s.templateId,
          template_name: (s as any).template?.name ?? null,
          session_type: s.sessionType,
          session_date: s.sessionDate,
          unit: s.unit,
          body_values: JSON.stringify(s.bodyValues),
          ease_values: JSON.stringify(s.easeValues),
          cut_values: JSON.stringify(s.cutValues),
          posture_notes: JSON.stringify(s.postureNotes),
          fit_notes_text: s.fitNotesText,
          ease_profile: s.easeProfile,
          is_pinned: s.isPinned ? 1 : 0,
          pin_label: s.pinLabel,
          is_client_submission: s.isClientSubmission ? 1 : 0,
          created_at: new Date(s.createdAt).getTime(),
        })),
        updated: [],
        deleted: [],
      },
      orders: {
        created: changedOrders.map(o => ({
          id: o.id,
          server_id: o.id,
          shop_id: o.shopId,
          client_id: o.clientId,
          client_name: (o as any).client?.name ?? '',
          assigned_to: o.assignedTo,
          order_number: o.orderNumber,
          status: o.status,
          priority: o.priority,
          due_date: o.dueDate,
          total_price: o.totalPrice,
          paid_amount: o.paidAmount,
          internal_notes: o.internalNotes,
          client_notes: o.clientNotes,
          created_at: new Date(o.createdAt).getTime(),
          updated_at: new Date(o.updatedAt).getTime(),
        })),
        updated: [],
        deleted: [],
      },
      garment_items: {
        created: changedItems.map(i => ({
          id: i.id,
          server_id: i.id,
          order_id: i.orderId,
          shop_id: i.shopId,
          measurement_session_id: i.measurementSessionId,
          template_id: i.templateId,
          template_name: (i as any).template?.name ?? '',
          fabric_id: i.fabricId,
          cut_values_override: i.cutValuesOverride ? JSON.stringify(i.cutValuesOverride) : null,
          yardage_estimated: i.yardageEstimated,
          style_notes: i.styleNotes,
          created_at: new Date(i.createdAt).getTime(),
        })),
        updated: [],
        deleted: [],
      },
      garment_templates: {
        created: systemTemplates.map(t => ({
          id: t.id,
          server_id: t.id,
          name: t.name,
          category: t.category,
          gender: t.gender,
          cultural_region: t.culturalRegion,
          fields: JSON.stringify(t.fields),
          ease_defaults: JSON.stringify(t.easeDefaults),
          diagram_variant: t.diagramVariant,
          yardage_formula: t.yardageFormula ? JSON.stringify(t.yardageFormula) : null,
          is_system: 1,
          cached_at: Date.now(),
        })),
        updated: [],
        deleted: [],
      },
    }

    return { changes, timestamp }
  })

  // ── PUSH — apply client changes to server ──────────────────
  app.post('/api/sync/push', {
    schema: {
      summary: 'Push local changes for offline sync',
      description: 'Applies locally-created clients, measurement sessions, and orders to the server (WatermelonDB synchronize() push contract). Existing IDs are skipped via `onConflictDoNothing` rather than erroring.',
      body: {
        type: 'object',
        properties: {
          changes: {
            type: 'object',
            properties: {
              clients: { type: 'object', properties: { created: { type: 'array', items: { type: 'object', additionalProperties: true } }, updated: { type: 'array', items: { type: 'object', additionalProperties: true } } }, additionalProperties: false },
              measurement_sessions: { type: 'object', properties: { created: { type: 'array', items: { type: 'object', additionalProperties: true } } }, additionalProperties: false },
              orders: { type: 'object', properties: { created: { type: 'array', items: { type: 'object', additionalProperties: true } }, updated: { type: 'array', items: { type: 'object', additionalProperties: true } } }, additionalProperties: false },
            },
            additionalProperties: false,
          },
        },
        required: ['changes'],
      },
      response: {
        200: successEnvelope(syncPushResultSchema, { title: 'Sync Push Response' }),
        ...errorResponses(),
      },
    },
  }, async (request) => {
    const { shopId, workerId } = request.auth
    const { changes } = request.body as {
      changes: {
        clients?: { created?: any[]; updated?: any[] }
        measurement_sessions?: { created?: any[] }
        orders?: { created?: any[]; updated?: any[] }
      }
    }

    const results = { applied: 0, errors: [] as string[] }

    // Push new clients
    for (const c of changes.clients?.created ?? []) {
      try {
        await db.insert(clients).values({
          id: c.id,
          shopId,
          createdBy: workerId,
          name: c.name,
          phone: c.phone,
          email: c.email,
          preferredUnit: c.preferred_unit ?? 'cm',
          preferredLanguage: c.preferred_language ?? 'en',
          timezone: c.timezone,
          bodyTypeTags: c.body_type_tags ? JSON.parse(c.body_type_tags) : [],
          postureProfile: c.posture_profile ? JSON.parse(c.posture_profile) : {},
          internalNotes: c.internal_notes,
          isActive: c.is_active !== 0,
        }).onConflictDoNothing()
        results.applied++
      } catch (err: any) {
        results.errors.push(`client ${c.id}: ${err.message}`)
      }
    }

    // Push new measurement sessions
    for (const s of changes.measurement_sessions?.created ?? []) {
      try {
        await db.insert(measurementSessions).values({
          id: s.id,
          clientId: s.client_id,
          shopId,
          takenBy: workerId,
          templateId: s.template_id,
          sessionType: s.session_type,
          sessionDate: s.session_date,
          unit: s.unit ?? 'cm',
          bodyValues: s.body_values ? JSON.parse(s.body_values) : {},
          easeValues: s.ease_values ? JSON.parse(s.ease_values) : {},
          cutValues: s.cut_values ? JSON.parse(s.cut_values) : {},
          postureNotes: s.posture_notes ? JSON.parse(s.posture_notes) : {},
          fitNotesText: s.fit_notes_text,
          easeProfile: s.ease_profile ?? 'regular',
          isPinned: s.is_pinned === 1,
          pinLabel: s.pin_label,
          isClientSubmission: s.is_client_submission === 1,
        }).onConflictDoNothing()
        results.applied++
      } catch (err: any) {
        results.errors.push(`session ${s.id}: ${err.message}`)
      }
    }

    // Push new orders
    for (const o of changes.orders?.created ?? []) {
      try {
        await db.insert(orders).values({
          id: o.id,
          shopId,
          clientId: o.client_id,
          assignedTo: o.assigned_to,
          orderNumber: o.order_number,
          status: o.status ?? 'booked',
          priority: o.priority ?? 'normal',
          dueDate: o.due_date,
          totalPrice: o.total_price,
          paidAmount: o.paid_amount ?? '0',
          internalNotes: o.internal_notes,
          clientNotes: o.client_notes,
        }).onConflictDoNothing()
        results.applied++
      } catch (err: any) {
        results.errors.push(`order ${o.id}: ${err.message}`)
      }
    }

    return { success: true, data: results }
  })
}

function mapClientToWatermelon(c: any) {
  return {
    id: c.id,
    server_id: c.id,
    shop_id: c.shopId ?? c.shop_id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    photo_key: c.photoKey ?? c.photo_key,
    preferred_unit: c.preferredUnit ?? c.preferred_unit ?? 'cm',
    preferred_language: c.preferredLanguage ?? c.preferred_language ?? 'en',
    timezone: c.timezone,
    body_type_tags: JSON.stringify(c.bodyTypeTags ?? c.body_type_tags ?? []),
    posture_profile: JSON.stringify(c.postureProfile ?? c.posture_profile ?? {}),
    style_preferences: JSON.stringify({}),
    internal_notes: c.internalNotes ?? c.internal_notes,
    is_active: (c.isActive ?? c.is_active) ? 1 : 0,
    created_at: c.createdAt ? new Date(c.createdAt).getTime() : Date.now(),
    updated_at: c.updatedAt ? new Date(c.updatedAt).getTime() : Date.now(),
    synced_at: Date.now(),
  }
}
