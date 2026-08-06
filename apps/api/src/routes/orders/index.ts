import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  db, orders, garmentItems, orderPayments,
  fittingSessions, clients, workers, measurementSessions,
} from '@stitchbook/db'
import { eq, and, desc, sql, inArray } from 'drizzle-orm'
import {
  fromZod,
  successEnvelope,
  paginatedEnvelope,
  responses,
  errorResponses,
} from '../../lib/schema.js'

const CreateOrderSchema = z.object({
  clientId: z.string().uuid(),
  assignedTo: z.string().uuid().optional(),
  orderNumber: z.string().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  totalPrice: z.string().optional(),
  depositAmount: z.string().optional(),
  internalNotes: z.string().optional(),
  clientNotes: z.string().optional(),
  // Garment items to attach to this order
  garmentItems: z.array(z.object({
    measurementSessionId: z.string().uuid().optional(),
    price: z.union([z.string(), z.number()]).optional(),
    templateId: z.string().uuid(),
    fabricId: z.string().uuid().optional(),
    yardageEstimated: z.string().optional(),
    styleNotes: z.string().optional(),
    cutValuesOverride: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
  })).min(1),
})

const UpdateOrderSchema = z.object({
  status: z.enum([
    'booked', 'measured', 'cutting', 'in_progress',
    'fitting', 'final_adjustments', 'ready', 'delivered', 'cancelled',
  ]).optional(),
  // .nullable() lets clients send assignedTo: null to explicitly unassign
  assignedTo: z.string().uuid().nullable().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  totalPrice: z.union([z.string(), z.number()]).optional(),
  internalNotes: z.string().optional(),
  clientNotes: z.string().optional(),
})

const RecordPaymentSchema = z.object({
  amount: z.union([z.string(), z.number()])
    .transform(v => parseFloat(String(v)))
    .pipe(z.number().positive('Payment amount must be a positive number').max(9_999_999, 'Payment exceeds maximum')),
  method: z.enum(['cash', 'bank_transfer', 'card', 'mobile_money', 'ussd']),
  reference: z.string().optional(),
  notes: z.string().optional(),
})

const CreateFittingSessionSchema = z.object({
  garmentItemId: z.string().uuid(),
  sessionType: z.enum(['toile', 'first_fitting', 'second_fitting', 'third_fitting', 'final_fitting']),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fitIssues: z.array(z.object({
    category: z.enum(['silhouette', 'shoulder', 'back', 'sleeve', 'length', 'other']),
    issue: z.string(),
    severity: z.enum(['minor', 'moderate', 'significant']),
    adjustmentMade: z.string(),
    amountCm: z.number().optional(),
  })).default([]),
  freeNotes: z.string().optional(),
  clientApproved: z.boolean().optional(),
  clientApprovalNotes: z.string().optional(),
})

const OrderIdParamsSchema = z.object({ id: z.string().uuid() })
const FittingSessionIdParamsSchema = z.object({ sessionId: z.string().uuid() })
const GarmentItemIdParamsSchema = z.object({ itemId: z.string().uuid() })
const LinkGarmentSessionBodySchema = z.object({ measurementSessionId: z.string().uuid() })
const FittingPhotoQuerySchema = z.object({ type: z.enum(['before', 'after']).optional().default('before') })

const OrderStatusSchema = z.enum([
  'booked', 'measured', 'cutting', 'in_progress',
  'fitting', 'final_adjustments', 'ready', 'delivered', 'cancelled',
])

const ListOrdersQuerySchema = z.object({
  status: OrderStatusSchema.optional(),
  assignedTo: z.string().uuid().optional(),
  page: z.coerce.number().min(1).optional().default(1),
  pageSize: z.coerce.number().min(1).max(100).optional().default(20),
})

const ClientSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string().nullable(),
})

const WorkerSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: z.string().nullable().optional(),
})

const TemplateSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: z.string().nullable(),
})

const OrderListItemSchema = z.object({
  id: z.string().uuid(),
  shopId: z.string().uuid(),
  clientId: z.string().uuid(),
  assignedTo: z.string().uuid().nullable(),
  orderNumber: z.string(),
  status: OrderStatusSchema,
  priority: z.string(),
  dueDate: z.string().nullable(),
  totalPrice: z.string().nullable(),
  depositAmount: z.string().nullable(),
  paidAmount: z.string(),
  internalNotes: z.string().nullable(),
  clientNotes: z.string().nullable(),
  photoKeys: z.array(z.string()),
  sbSyncedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  client: ClientSummarySchema,
  assignedWorker: WorkerSummarySchema.nullable(),
  garmentItems: z.array(z.object({
    id: z.string().uuid(),
    template: TemplateSummarySchema,
  })),
})

const GarmentItemSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  shopId: z.string().uuid(),
  measurementSessionId: z.string().uuid().nullable(),
  templateId: z.string().uuid(),
  fabricId: z.string().uuid().nullable(),
  cutValuesOverride: z.record(z.string(), z.union([z.number(), z.string()])).nullable(),
  yardageEstimated: z.string().nullable(),
  yardageUsed: z.string().nullable(),
  styleNotes: z.string().nullable(),
  photoKeys: z.record(z.string(), z.array(z.string())),
  alterations: z.array(z.record(z.string(), z.any())),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  template: z.record(z.string(), z.any()),
  session: z.record(z.string(), z.any()).nullable(),
  fittingSessions: z.array(z.record(z.string(), z.any())),
})

const PaymentSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  shopId: z.string().uuid(),
  recordedBy: z.string().uuid().nullable(),
  amount: z.string(),
  method: z.enum(['cash', 'bank_transfer', 'card', 'mobile_money', 'ussd']),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  paidAt: z.string().datetime(),
  createdAt: z.string().datetime(),
})

const OrderDetailSchema = z.object({
  id: z.string().uuid(),
  shopId: z.string().uuid(),
  clientId: z.string().uuid(),
  assignedTo: z.string().uuid().nullable(),
  orderNumber: z.string(),
  status: OrderStatusSchema,
  priority: z.string(),
  dueDate: z.string().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  totalPrice: z.string().nullable(),
  depositAmount: z.string().nullable(),
  paidAmount: z.string(),
  internalNotes: z.string().nullable(),
  clientNotes: z.string().nullable(),
  photoKeys: z.array(z.string()),
  sbSyncedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  client: z.record(z.string(), z.any()),
  assignedWorker: WorkerSummarySchema.nullable(),
  garmentItems: z.array(GarmentItemSchema),
  payments: z.array(PaymentSchema),
})

const FittingSessionSchema = z.object({
  id: z.string().uuid(),
  garmentItemId: z.string().uuid(),
  shopId: z.string().uuid(),
  conductedBy: z.string().uuid().nullable(),
  sessionType: z.enum(['toile', 'first_fitting', 'second_fitting', 'third_fitting', 'final_fitting']),
  sessionDate: z.string(),
  fitIssues: z.array(z.record(z.string(), z.any())),
  freeNotes: z.string().nullable(),
  beforePhotoKeys: z.array(z.string()),
  afterPhotoKeys: z.array(z.string()),
  clientApproved: z.boolean().nullable(),
  clientApprovedAt: z.string().datetime().nullable(),
  clientApprovalNotes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const orderResponses = {
  list: responses(paginatedEnvelope(fromZod(OrderListItemSchema, { title: 'OrderListItem' }), { title: 'List Orders Response' })),
  detail: responses(successEnvelope(fromZod(OrderDetailSchema, { title: 'OrderDetail' }), { title: 'Order Detail Response' })),
  create: responses(successEnvelope(fromZod(OrderDetailSchema, { title: 'OrderDetail' }), { title: 'Create Order Response' }), { statuses: [201] }),
  update: responses(successEnvelope(fromZod(OrderDetailSchema, { title: 'OrderDetail' }), { title: 'Update Order Response' })),
  payment: responses(successEnvelope(fromZod(PaymentSchema, { title: 'OrderPayment' }), { title: 'Record Payment Response' }), { statuses: [201] }),
  fittingSession: responses(successEnvelope(fromZod(FittingSessionSchema, { title: 'FittingSession' }), { title: 'Add Fitting Session Response' }), { statuses: [201] }),
  fittingPhoto: responses(successEnvelope(fromZod(z.object({ key: z.string(), url: z.string(), type: z.string() }), { title: 'FittingPhotoUpload' }), { title: 'Upload Fitting Photo Response' })),
  board: responses(successEnvelope(fromZod(z.record(z.string(), z.array(OrderListItemSchema)), { title: 'OrderBoard' }), { title: 'Production Board Response' })),
  garmentItemUpdate: responses(successEnvelope(fromZod(z.object({ id: z.string().uuid(), orderId: z.string().uuid(), measurementSessionId: z.string().uuid().nullable() }), { title: 'GarmentItemUpdate' }), { title: 'Update Garment Item Response' })),
}

export async function orderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // ── LIST orders ───────────────────────────────────────────
  app.get('/', { schema: { summary: 'List orders', querystring: fromZod(ListOrdersQuerySchema), response: orderResponses.list } }, async (request) => {
    const { shopId } = request.auth
    const query = request.query as {
      status?: string; assignedTo?: string; page?: string; pageSize?: string
    }
    const page = Math.max(1, Number(query.page ?? 1))
    const pageSize = Math.min(100, Number(query.pageSize ?? 20))
    const offset = (page - 1) * pageSize

    const conditions = [eq(orders.shopId, shopId)]
    if (query.status) conditions.push(eq(orders.status, query.status as any))
    if (query.assignedTo) conditions.push(eq(orders.assignedTo, query.assignedTo))

    const where = and(...conditions)

    const [items, totalResult] = await Promise.all([
      db.query.orders.findMany({
        where,
        orderBy: [desc(orders.updatedAt)],
        limit: pageSize,
        offset,
        with: {
          client: { columns: { id: true, name: true, phone: true } },
          assignedWorker: { columns: { id: true, name: true } },
          garmentItems: {
            columns: { id: true },
            with: { template: { columns: { name: true, category: true } } },
          },
        },
      }),
      db.select({ total: sql<number>`count(*)::int` }).from(orders).where(where),
    ])

    const total = totalResult[0]?.total ?? 0;

    return {
      success: true,
      data: { items, total, page, pageSize, hasMore: offset + items.length < total },
    }
  })

  // ── GET single order ───────────────────────────────────────
  app.get('/:id', { schema: { summary: 'Get a single order', params: fromZod(OrderIdParamsSchema), response: orderResponses.detail } }, async (request) => {
    const { id } = request.params as { id: string }
    const { shopId } = request.auth

    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, id), eq(orders.shopId, shopId)),
      with: {
        client: true,
        assignedWorker: { columns: { id: true, name: true, role: true } },
        garmentItems: {
          with: {
            template: true,
            session: {
              columns: {
                id: true, sessionDate: true, bodyValues: true,
                cutValues: true, easeValues: true, postureNotes: true,
              },
            },
            fittingSessions: { orderBy: [desc(fittingSessions.sessionDate)] },
          },
        },
        payments: { orderBy: [desc(orderPayments.paidAt)] },
      },
    })

    if (!order) throw { statusCode: 404, message: 'Order not found' }
    return { success: true, data: order }
  })

  // ── CREATE order ───────────────────────────────────────────
  app.post('/', { schema: { summary: 'Create an order', description: 'Auto-generates orderNumber if omitted. Creates the order and its garment items in one transaction.', body: fromZod(CreateOrderSchema), response: orderResponses.create } }, async (request, reply) => {
    const body = CreateOrderSchema.parse(request.body)
    const { shopId, workerId } = request.auth

    // Verify client
    const client = await db.query.clients.findFirst({
      where: and(eq(clients.id, body.clientId), eq(clients.shopId, shopId)),
      columns: { id: true },
    })
    if (!client) throw { statusCode: 404, message: 'Client not found' }

    // Auto-generate order number if not provided
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.shopId, shopId))
    const orderCount = countResult[0]?.count ?? 0;
    const orderNumber = body.orderNumber ?? `#${String(orderCount + 1).padStart(4, '0')}`

    const result = await db.transaction(async (tx) => {
      const [order] = await tx.insert(orders).values({
        shopId,
        clientId: body.clientId,
        assignedTo: body.assignedTo,
        orderNumber,
        dueDate: body.dueDate,
        priority: body.priority,
        totalPrice: body.totalPrice !== undefined ? String(body.totalPrice) : undefined,
        depositAmount: body.depositAmount !== undefined ? String(body.depositAmount) : undefined,
        internalNotes: body.internalNotes,
        clientNotes: body.clientNotes,
      }).returning()

      if (!order) throw new Error('Order creation failed — transaction rolled back')

      const items = await tx.insert(garmentItems).values(
        body.garmentItems.map(item => ({
          orderId: order.id,
          shopId,
          measurementSessionId: item.measurementSessionId ?? null,
          price: item.price !== undefined ? String(item.price) : undefined,
          templateId: item.templateId,
          fabricId: item.fabricId,
          yardageEstimated: item.yardageEstimated,
          styleNotes: item.styleNotes,
          cutValuesOverride: item.cutValuesOverride as Record<string, string | number> | undefined,
        } as any))
      ).returning()

      return { order, items }
    })

    // Notify assigned worker if set
    if (body.assignedTo) {
      const assignedWorker = await db.query.workers.findFirst({
        where: eq(workers.id, body.assignedTo),
        columns: { pushTokens: true, name: true },
      })
      if (assignedWorker?.pushTokens?.length) {
        // Push notification via BullMQ — non-blocking
        await app.notifications.queue({
          shopId,
          channel: 'push',
          to: assignedWorker.pushTokens[0]!,
          eventType: 'order_status_changed',
          resourceId: result.order.id,
          message: `New order assigned: ${orderNumber}`,
        })
      }
    }

    reply.code(201)
    return { success: true, data: result }
  })

  // ── UPDATE order status ─────────────────────────────────────────
  app.patch('/:id', { schema: { summary: 'Update an order', description: 'Status transitions are forward-only through the production pipeline (cancellation excepted); cancelled orders reject further updates.', params: fromZod(OrderIdParamsSchema), body: fromZod(UpdateOrderSchema), response: orderResponses.update } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = UpdateOrderSchema.parse(request.body)
    const { shopId } = request.auth

    // Enforce forward-only status transitions
    if (body.status) {
      const PIPELINE = ['booked','measured','cutting','in_progress','fitting','final_adjustments','ready','delivered']
      const current = await db.query.orders.findFirst({
        where: and(eq(orders.id, id), eq(orders.shopId, shopId)),
        columns: { status: true },
      })
      if (!current) throw { statusCode: 404, message: 'Order not found' }
      if (current.status === 'cancelled') {
        throw { statusCode: 422, message: 'Cancelled orders cannot be modified' }
      }
      if (body.status !== 'cancelled') {
        const currIdx = PIPELINE.indexOf(current.status)
        const nextIdx = PIPELINE.indexOf(body.status)
        if (nextIdx < currIdx) {
          throw { statusCode: 422, message: `Cannot move order backwards from "${current.status}" to "${body.status}"` }
        }
      }
    }

    const updateValues: Record<string, unknown> = { ...body, updatedAt: new Date() }
    if (body.totalPrice !== undefined) updateValues['totalPrice'] = String(body.totalPrice)

    const [updated] = await db
      .update(orders)
      .set(updateValues)
      .where(and(eq(orders.id, id), eq(orders.shopId, shopId)))
      .returning()

    if (!updated) throw { statusCode: 404, message: 'Order not found' }

    // If marked ready — notify client
    if (body.status === 'ready') {
      const orderWithClient = await db.query.orders.findFirst({
        where: eq(orders.id, id),
        with: { client: { columns: { phone: true, email: true, preferredLanguage: true } } },
      })
      if (orderWithClient?.client?.phone) {
        await app.notifications.queue({
          shopId,
          clientId: orderWithClient.clientId ?? undefined,
          channel: 'whatsapp',
          to: orderWithClient.client.phone,
          eventType: 'order_ready',
          resourceId: id,
          message: `Your garment is ready for collection! Contact us to arrange pickup.`,
          language: orderWithClient.client.preferredLanguage,
        })
      }
    }

    return { success: true, data: updated }
  })

  // ── RECORD payment ────────────────────────────────────────────
  app.post('/:id/payments', { schema: { summary: 'Record a payment on an order', params: fromZod(OrderIdParamsSchema), body: fromZod(RecordPaymentSchema), response: orderResponses.payment } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = RecordPaymentSchema.parse(request.body)
    const { shopId, workerId } = request.auth

    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, id), eq(orders.shopId, shopId)),
      columns: { id: true, paidAmount: true, totalPrice: true, status: true },
    })
    if (!order) throw { statusCode: 404, message: 'Order not found' }
    if (order.status === 'cancelled') {
      throw { statusCode: 422, message: 'Cannot record payment on a cancelled order' }
    }

    const [payment] = await db.insert(orderPayments).values({
      orderId: id,
      shopId,
      recordedBy: workerId,
      amount: String(body.amount), // numeric() columns require string values
      method: body.method,
      reference: body.reference,
      notes: body.notes,
    }).returning()

    // Update cumulative paid amount on the order
    await db.update(orders)
      .set({
        paidAmount: sql`${orders.paidAmount} + ${String(body.amount)}`,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id))

    reply.code(201)
    return { success: true, data: payment }
  })

  // ── ADD fitting session ─────────────────────────────────────────
  app.post('/fitting-sessions', { schema: { summary: 'Add a fitting session', body: fromZod(CreateFittingSessionSchema), response: orderResponses.fittingSession } }, async (request, reply) => {
    const body = CreateFittingSessionSchema.parse(request.body)
    const { shopId, workerId } = request.auth

    // Verify garment item belongs to this shop
    const item = await db.query.garmentItems.findFirst({
      where: and(eq(garmentItems.id, body.garmentItemId), eq(garmentItems.shopId, shopId)),
      columns: { id: true },
    })
    if (!item) throw { statusCode: 404, message: 'Garment item not found' }

    const [session] = await db.insert(fittingSessions).values({
      garmentItemId: body.garmentItemId,
      shopId,
      conductedBy: workerId,
      sessionType: body.sessionType,
      sessionDate: body.sessionDate,
      fitIssues: body.fitIssues,
      freeNotes: body.freeNotes,
      clientApproved: body.clientApproved,
      clientApprovedAt: body.clientApproved ? new Date() : undefined,
      clientApprovalNotes: body.clientApprovalNotes,
    } as any).returning()

    reply.code(201)
    return { success: true, data: session }
  })

  // ── UPLOAD fitting photos ─────────────────────────────────────
  app.post('/fitting-sessions/:sessionId/photos', { schema: { summary: 'Upload a fitting session photo', description: 'Multipart file upload via `request.file()` — not a JSON body.', params: fromZod(FittingSessionIdParamsSchema), querystring: fromZod(FittingPhotoQuerySchema), consumes: ['multipart/form-data'], response: orderResponses.fittingPhoto } }, async (request) => {
    const { sessionId } = request.params as { sessionId: string }
    const { shopId } = request.auth
    const query = request.query as { type?: string }
    const photoType = query.type === 'after' ? 'after' : 'before'

    const session = await db.query.fittingSessions.findFirst({
      where: and(eq(fittingSessions.id, sessionId), eq(fittingSessions.shopId, shopId)),
      columns: { id: true, beforePhotoKeys: true, afterPhotoKeys: true },
    })
    if (!session) throw { statusCode: 404, message: 'Fitting session not found' }

    const file = await request.file()
    if (!file) throw { statusCode: 400, message: 'No file uploaded' }

    const buffer = await file.toBuffer()
    const key = await app.storage.upload({
      shopId,
      category: 'orders',
      filename: file.filename,
      contentType: file.mimetype,
      body: buffer,
    })

    const existingKeys = photoType === 'before'
      ? (session.beforePhotoKeys ?? [])
      : (session.afterPhotoKeys ?? [])

    await db.update(fittingSessions)
      .set(
        photoType === 'before'
          ? { beforePhotoKeys: [...existingKeys, key] }
          : { afterPhotoKeys: [...existingKeys, key] }
      )
      .where(eq(fittingSessions.id, sessionId))

    const signedUrl = await app.storage.getSignedUrl(key)
    return { success: true, data: { key, url: signedUrl, type: photoType } }
  })

  // ── PRODUCTION BOARD (kanban data) ───────────────────────────────
  app.get('/board/kanban', { schema: { summary: 'Get production board (kanban) data', description: 'Active orders (excludes delivered/cancelled), grouped by status.', response: orderResponses.board } }, async (request) => {
    const { shopId } = request.auth
    const statuses = [
      'booked', 'measured', 'cutting', 'in_progress',
      'fitting', 'final_adjustments', 'ready',
    ] as const

    const allOrders = await db.query.orders.findMany({
      where: and(
        eq(orders.shopId, shopId),
        inArray(orders.status, statuses as any)
      ),
      orderBy: [desc(orders.dueDate)],
      with: {
        client: { columns: { id: true, name: true } },
        assignedWorker: { columns: { id: true, name: true } },
        garmentItems: {
          columns: { id: true },
          with: { template: { columns: { name: true } } },
        },
      },
    })

    // Group by status
    const board = Object.fromEntries(
      statuses.map(s => [s, allOrders.filter(o => o.status === s)])
    )

    return { success: true, data: board }
  })

  // PATCH /orders/garment-items/:itemId — attach session to garment item after creation
  app.patch('/garment-items/:itemId', { schema: { summary: 'Attach a measurement session to a garment item', description: 'Auto-advances the parent order from booked to measured if it was still unstarted.', params: fromZod(GarmentItemIdParamsSchema), body: fromZod(LinkGarmentSessionBodySchema), response: orderResponses.garmentItemUpdate } }, async (request) => {
    const { itemId } = request.params as { itemId: string }
    const { shopId } = (request as any).auth
    const body = LinkGarmentSessionBodySchema.parse(request.body)

    // Verify the session belongs to the same shop before linking
    const session = await db.query.measurementSessions.findFirst({
      where: and(eq(measurementSessions.id, body.measurementSessionId), eq(measurementSessions.shopId, shopId)),
      columns: { id: true },
    })
    if (!session) throw { statusCode: 404, message: 'Measurement session not found in this shop' }

    const [updated] = await db.update(garmentItems)
      .set({ measurementSessionId: body.measurementSessionId, updatedAt: new Date() })
      .where(and(eq(garmentItems.id, itemId), eq(garmentItems.shopId, shopId)))
      .returning({ id: garmentItems.id, orderId: garmentItems.orderId, measurementSessionId: garmentItems.measurementSessionId })
    if (!updated) throw { statusCode: 404, message: 'Garment item not found' }
    // Auto-advance order from booked -> measured if it was still unstarted
    const order = await db.query.orders.findFirst({ where: eq(orders.id, updated.orderId), columns: { id: true, status: true } })
    if (order?.status === 'booked') {
      await db.update(orders).set({ status: 'measured', updatedAt: new Date() }).where(eq(orders.id, order.id))
    }
    return { success: true, data: updated }
  })
}
