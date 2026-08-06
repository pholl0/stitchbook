import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { PLAN_FEATURES } from '@stitchbook/types'
import { db, workers, shops, portalOtpTokens } from '@stitchbook/db'
import { eq, and } from 'drizzle-orm'
import { generateOtpToken, hashToken } from '@stitchbook/utils'
import { hasPlanFeature } from '@/lib/planGate.js'
import { normalisePhone } from '@/lib/phone.js'
import {
  fromZod,
  successEnvelope,
  listEnvelope,
  responses,
  noContentResponse,
  errorResponses,
} from '../../lib/schema.js'

const UpdateWorkerSchema = z.object({
  // 'owner' is excluded — ownership transfer is not permitted via the API
  role:     z.enum(['manager', 'tailor', 'cutter']).optional(),
  isActive: z.boolean().optional(),
})
const UpdateMeSchema = z.object({
  name:  z.string().min(1).optional(),
  phone: z.string().optional(),
})
const InviteWorkerSchema = z.object({
  phone: z.string().optional(),
  email: z.string().email().optional(),
  role:  z.enum(['tailor', 'cutter', 'manager']),
}).refine(d => d.phone || d.email, { message: 'Phone or email required' })
const PushTokenSchema = z.object({
  token:    z.string().min(1),
  platform: z.enum(['ios', 'android']),
})
const WorkerIdParamsSchema = z.object({ id: z.string().uuid() })

const WorkerSchema = z.object({
  id: z.string().uuid(),
  shopId: z.string().uuid(),
  authUserId: z.string().nullable(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.string(),
  isActive: z.boolean(),
  lastSeenAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const workerResponses = {
  me: responses(successEnvelope(fromZod(WorkerSchema.pick({ id: true, name: true, email: true, phone: true, role: true, shopId: true, isActive: true }), { title: 'WorkerMe' }), { title: 'Current Worker Response' })),
  updateMe: responses(successEnvelope(fromZod(WorkerSchema.pick({ id: true, name: true, email: true, phone: true, role: true }), { title: 'WorkerUpdateMe' }), { title: 'Update Me Response' })),
  pushToken: {
    204: noContentResponse,
    ...errorResponses(),
  },
  list: responses(listEnvelope(fromZod(WorkerSchema.pick({ id: true, name: true, email: true, phone: true, role: true, isActive: true, lastSeenAt: true }), { title: 'WorkerListItem' }), { title: 'List Workers Response' })),
  invite: responses(successEnvelope(fromZod(z.object({ workerId: z.string().uuid(), inviteUrl: z.string(), expiresAt: z.string().datetime() }), { title: 'WorkerInvite' }), { title: 'Invite Worker Response' }), { statuses: [201] }),
  update: responses(successEnvelope(fromZod(WorkerSchema.pick({ id: true, role: true, isActive: true }), { title: 'WorkerUpdate' }), { title: 'Update Worker Response' })),
}

export async function workerRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // GET /workers/me — must be before /:id
  app.get('/me', { schema: { summary: 'Get current worker', response: workerResponses.me } }, async (request) => {
    const { workerId } = (request as any).auth
    const worker = await db.query.workers.findFirst({
      where: eq(workers.id, workerId),
      columns: { id: true, name: true, email: true, phone: true, role: true, shopId: true, isActive: true },
    })
    if (!worker) throw { statusCode: 404, message: 'Worker not found' }
    return { success: true, data: worker }
  })

  // PATCH /workers/me
  app.patch('/me', { schema: { summary: "Update current worker's own profile", body: fromZod(UpdateMeSchema), response: workerResponses.updateMe } }, async (request) => {
    const { workerId } = (request as any).auth
    const body = UpdateMeSchema.parse(request.body)
    const [updated] = await db.update(workers)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(workers.id, workerId))
      .returning({ id: workers.id, name: workers.name, email: workers.email, phone: workers.phone, role: workers.role })
    return { success: true, data: updated }
  })

  // POST /workers/me/push-token
  app.post('/me/push-token', { schema: { summary: 'Register a push notification token', description: 'Deduplicated and capped at 10 tokens per worker (oldest evicted).', body: fromZod(PushTokenSchema), response: workerResponses.pushToken } }, async (request, reply) => {
    const { workerId } = (request as any).auth
    const body = PushTokenSchema.parse(request.body)
    const worker = await db.query.workers.findFirst({ where: eq(workers.id, workerId), columns: { pushTokens: true } })
    const existing = worker?.pushTokens ?? []
    if (!existing.includes(body.token)) {
      // Cap at 10 tokens per worker (prevents unbounded array growth if a worker cycles devices)
      const capped = [...existing, body.token].slice(-10)
      await db.update(workers).set({ pushTokens: capped, updatedAt: new Date() }).where(eq(workers.id, workerId))
    }
    reply.code(204)
  })

  app.get('/', { schema: { summary: 'List workers in the current shop', response: workerResponses.list } }, async (request) => {
    const { shopId } = (request as any).auth
    const allWorkers = await db.query.workers.findMany({
      where: eq(workers.shopId, shopId),
      columns: { id: true, name: true, email: true, phone: true, role: true, isActive: true, lastSeenAt: true },
    })
    return { success: true, data: allWorkers }
  })

  // POST /workers/invite — single definition with plan gating
  app.post('/invite', { schema: { summary: 'Invite a new worker', description: 'Requires the maxWorkers plan feature and an available seat. Sends the invite link via WhatsApp (phone) or email.', body: fromZod(InviteWorkerSchema), response: workerResponses.invite } }, async (request, reply) => {
    const { shopId, workerId } = (request as any).auth
    const body = InviteWorkerSchema.parse(request.body)
    const shop = await db.query.shops.findFirst({
      where: eq(shops.id, shopId),
      with: { workers: { where: (w: any, { eq: eqFn }: any) => eqFn(w.isActive, true) } },
    })
    if (!hasPlanFeature(shop?.planTier ?? 'solo', 'maxWorkers')) {
      throw { statusCode: 403, message: 'Your plan does not support worker invites. Upgrade to Boutique.' }
    }
    const maxWorkers = PLAN_FEATURES[(shop?.planTier ?? 'solo') as keyof typeof PLAN_FEATURES].maxWorkers
    if (maxWorkers !== null && ((shop as any)?.workers?.length ?? 0) >= maxWorkers) {
      throw { statusCode: 422, message: `Worker limit reached for your plan (${maxWorkers}). Upgrade to add more.` }
    }
    const normPhone = body.phone ? normalisePhone(body.phone) : undefined
    if (body.phone && !normPhone) throw { statusCode: 422, message: 'Invalid phone number format. Use E.164 e.g. +2348000000000' }
    const [worker] = await db.insert(workers).values({
      shopId, name: body.email ?? normPhone ?? 'Pending', email: body.email ?? null, phone: normPhone ?? null, role: body.role as any, isActive: false,
    } as any).returning()
    const rawToken  = generateOtpToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await db.insert(portalOtpTokens).values({ shopId, createdBy: workerId, tokenHash: hashToken(rawToken), tokenType: 'worker_invite', resourceId: worker!.id, expiresAt } as any)
    const inviteUrl = `${process.env["WEB_URL"] ?? "http://localhost:3000"}/accept-invite?token=${rawToken}`
    if (normPhone) {
      await app.notifications.queue({ shopId, channel: "whatsapp", to: normPhone, eventType: "measurement_invite", message: `You have been invited to join a shop on StitchBook as ${body.role}. Accept here: ${inviteUrl}`, language: "en" })
    } else if (body.email) {
      await app.notifications.queue({ shopId, channel: "email", to: body.email, eventType: "measurement_invite", message: `You have been invited to join a shop on StitchBook as ${body.role}. Accept here: ${inviteUrl}`, language: "en" })
    }
    reply.code(201)
    return { success: true, data: { workerId: worker!.id, inviteUrl, expiresAt } }
  })

  // PATCH /workers/:id — owner-only role/status management
  app.patch("/:id", { schema: { summary: "Update a worker's role or active status", description: "Owner role required. Ownership cannot be transferred via this endpoint.", params: fromZod(WorkerIdParamsSchema), body: fromZod(UpdateWorkerSchema), response: workerResponses.update } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = UpdateWorkerSchema.parse(request.body)
    const { shopId, role } = (request as any).auth
    if (role !== "owner") throw { statusCode: 403, message: "Only owners can update worker roles" }
    const [updated] = await db.update(workers).set({ ...body, updatedAt: new Date() })
      .where(and(eq(workers.id, id), eq(workers.shopId, shopId)))
      .returning({ id: workers.id, role: workers.role, isActive: workers.isActive })
    return { success: true, data: updated }
  })
}
