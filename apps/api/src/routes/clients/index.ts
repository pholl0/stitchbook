import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db, clients, clientPortalTokens, measurementSessions } from '@stitchbook/db'
import { eq, and, ilike, desc, count } from 'drizzle-orm'
import { generatePortalToken, hashToken, getTokenPrefix } from '@stitchbook/utils'
import {
  fromZod,
  successEnvelope,
  paginatedEnvelope,
  listEnvelope,
  successOnlyResponse,
  responses,
  noContentResponse,
  errorResponses,
  type JsonSchema,
} from '../../lib/schema.js'

const CreateClientSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  preferredUnit: z.enum(['cm', 'in', 'in_frac']).default('cm'),
  preferredLanguage: z.string().default('en'),
  timezone: z.string().optional(),
  bodyTypeTags: z.array(z.string()).default([]),
  internalNotes: z.string().optional(),
})

const UpdateClientSchema = CreateClientSchema.partial()

const ListClientsSchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
})

const ClientSchema = z.object({
  id: z.string().uuid(),
  shopId: z.string().uuid(),
  createdBy: z.string().uuid().nullable(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  photoKey: z.string().nullable(),
  preferredUnit: z.enum(['cm', 'in', 'in_frac']),
  preferredLanguage: z.string(),
  timezone: z.string().nullable(),
  bodyTypeTags: z.array(z.string()),
  postureProfile: z.record(z.string(), z.any()),
  stylePreferences: z.record(z.string(), z.any()),
  internalNotes: z.string().nullable(),
  isActive: z.boolean(),
  sbSyncedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const ClientListItemSchema = ClientSchema.omit({ postureProfile: true, stylePreferences: true, internalNotes: true }).extend({
  portalToken: z.object({ isActive: z.boolean() }).nullable(),
})

const ClientDetailSchema = ClientSchema.extend({
  measurementSessions: z.array(z.record(z.string(), z.any())),
  portalToken: z.object({ isActive: z.boolean(), lastUsedAt: z.string().datetime().nullable() }).nullable(),
})

const PortalLinkSchema = z.object({
  portalUrl: z.string(),
  tokenCreatedAt: z.string().datetime().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
  note: z.string(),
})

const PortalLinkRotateSchema = z.object({
  portalUrl: z.string(),
  rawToken: z.string(),
  expiresAt: z.string().datetime().nullable(),
  message: z.string(),
})

const PhotoUploadSchema = z.object({
  photoUrl: z.string(),
  key: z.string(),
})

const ClientIdParamsSchema = z.object({ id: z.string().uuid() })

const clientResponses = {
  list: responses(paginatedEnvelope(fromZod(ClientListItemSchema, { title: 'ClientListItem' }), { title: 'List Clients Response' })),
  detail: responses(successEnvelope(fromZod(ClientDetailSchema, { title: 'ClientDetail' }), { title: 'Client Detail Response' })),
  create: responses(successEnvelope(fromZod(ClientSchema, { title: 'Client' }), { title: 'Create Client Response' }), { statuses: [201] }),
  update: responses(successEnvelope(fromZod(ClientSchema, { title: 'Client' }), { title: 'Update Client Response' })),
  delete: {
    200: successOnlyResponse({ title: 'Delete Client Response', description: 'Client soft-deleted successfully.' }),
    204: noContentResponse,
    ...errorResponses(),
  },
  portalLink: responses(successEnvelope(fromZod(PortalLinkSchema, { title: 'PortalLink' }), { title: 'Client Portal Link Response' })),
  portalLinkRotate: responses(successEnvelope(fromZod(PortalLinkRotateSchema, { title: 'PortalLinkRotate' }), { title: 'Rotate Portal Link Response' }), { statuses: [201] }),
  photoUpload: responses(successEnvelope(fromZod(PhotoUploadSchema, { title: 'PhotoUpload' }), { title: 'Client Photo Upload Response' })),
}

export async function clientRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', app.authenticate)

  // ── LIST clients ────────────────────────────────────────────
  app.get('/', { schema: { summary: 'List clients', querystring: fromZod(ListClientsSchema), response: clientResponses.list } }, async (request) => {
    const query = ListClientsSchema.parse(request.query)
    const { shopId } = request.auth
    const offset = (query.page - 1) * query.pageSize

    const where = query.search
      ? and(
          eq(clients.shopId, shopId),
          ilike(clients.name, `%${query.search}%`)
        )
      : eq(clients.shopId, shopId)

    const [items, totalResult] = await Promise.all([
      db.query.clients.findMany({
        where,
        orderBy: [desc(clients.updatedAt)],
        limit: query.pageSize,
        offset,
        with: {
          portalToken: { columns: { isActive: true } },
        },
      }),
      db.select({ total: count() }).from(clients).where(where),
    ])

    const total = totalResult[0]?.total ?? 0;

    return {
      success: true,
      data: {
        items,
        total,
        page: query.page,
        pageSize: query.pageSize,
        hasMore: offset + items.length < total,
      },
    }
  })

  // ── GET single client ───────────────────────────────────────
  app.get('/:id', { schema: { summary: 'Get a single client', description: 'Includes the 10 most recent measurement sessions and portal token status.', params: fromZod(ClientIdParamsSchema), response: clientResponses.detail } }, async (request) => {
    const { id } = request.params as { id: string }
    const { shopId } = request.auth

    const client = await db.query.clients.findFirst({
      where: and(eq(clients.id, id), eq(clients.shopId, shopId)),
      with: {
        measurementSessions: {
          orderBy: [desc(measurementSessions.sessionDate)],
          limit: 10,
          with: { template: { columns: { name: true, category: true } } },
        },
        portalToken: { columns: { isActive: true, lastUsedAt: true } },
      },
    })

    if (!client) {
      throw { statusCode: 404, message: 'Client not found' }
    }

    return { success: true, data: client }
  })

  // ── CREATE client ───────────────────────────────────────────
  app.post('/', { schema: { summary: 'Create a client', description: 'Also creates a portal access token in the same transaction. 409 if the phone number already exists in this shop.', body: fromZod(CreateClientSchema), response: clientResponses.create } }, async (request, reply) => {
    const body = CreateClientSchema.parse(request.body)
    const { shopId, workerId } = request.auth

    // Check for duplicate phone within this shop
    if (body.phone) {
      const existing = await db.query.clients.findFirst({
        where: and(
          eq(clients.shopId, shopId),
          eq(clients.phone, body.phone)
        ),
        columns: { id: true, name: true },
      })
      if (existing) {
        return reply.code(409).send({
          success: false,
          error: {
            code: 'DUPLICATE_PHONE',
            message: `A client with this phone number already exists: ${existing.name}`,
            details: { existingClientId: existing.id },
          },
        })
      }
    }

    // Create client and portal token in one transaction
    const result = await db.transaction(async (tx) => {
      const [client] = await tx.insert(clients).values({
        shopId,
        createdBy: workerId,
        ...body,
      }).returning()

      if (!client) throw new Error('Client creation failed — transaction rolled back')

      // Generate portal token for this client
      const rawToken = generatePortalToken()
      await tx.insert(clientPortalTokens).values({
        clientId: client.id,
        shopId,
        tokenHash: hashToken(rawToken),
        tokenPrefix: getTokenPrefix(rawToken),
      })

      return { client, rawToken }
    })

    reply.code(201)
    return { success: true, data: result.client }
  })

  // ── UPDATE client ───────────────────────────────────────────
  app.patch('/:id', { schema: { summary: 'Update a client', params: fromZod(ClientIdParamsSchema), body: fromZod(UpdateClientSchema), response: clientResponses.update } }, async (request) => {
    const { id } = request.params as { id: string }
    const body = UpdateClientSchema.parse(request.body)
    const { shopId } = request.auth

    const [updated] = await db
      .update(clients)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(clients.id, id), eq(clients.shopId, shopId)))
      .returning()

    if (!updated) throw { statusCode: 404, message: 'Client not found' }
    return { success: true, data: updated }
  })

  // ── SOFT DELETE client ──────────────────────────────────────
  app.delete('/:id', { schema: { summary: 'Soft-delete a client', description: 'Sets isActive: false — does not remove the record.', params: fromZod(ClientIdParamsSchema), response: clientResponses.delete } }, async (request) => {
    const { id } = request.params as { id: string }
    const { shopId } = request.auth

    await db
      .update(clients)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(clients.id, id), eq(clients.shopId, shopId)))

    return { success: true }
  })

  // ── GET client portal link ──────────────────────────────────
  app.get('/:id/portal-link', { schema: { summary: "Get a client's portal link", params: fromZod(ClientIdParamsSchema), response: clientResponses.portalLink } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { shopId } = request.auth

    // Verify client belongs to this shop
    const client = await db.query.clients.findFirst({
      where: and(eq(clients.id, id), eq(clients.shopId, shopId)),
      columns: { id: true },
    })
    if (!client) return reply.code(404).send({ message: 'Client not found' })

    // Get the shop slug for building the URL
    const { shops } = await import('@stitchbook/db')
    const shop = await db.query.shops.findFirst({
      where: eq(shops.id, shopId),
      columns: { slug: true },
    })

    // We only return the token prefix — the full raw token was only
    // available at creation time. Tailor can rotate to get a new one.
    const token = await db.query.clientPortalTokens.findFirst({
      where: and(
        eq(clientPortalTokens.clientId, id),
        eq(clientPortalTokens.isActive, true)
      ),
      columns: { tokenPrefix: true, lastUsedAt: true, createdAt: true },
    })

    return {
      success: true,
      data: {
        portalUrl: `${process.env['PORTAL_URL']}/${shop?.slug}/client/[token]`,
        tokenCreatedAt: token?.createdAt,
        lastUsedAt: token?.lastUsedAt,
        note: 'Full token is only shown at creation. Use /portal-link/rotate to generate a new link.',
      },
    }
  })

  // ── ROTATE portal token ─────────────────────────────────────
  app.post('/:id/portal-link/rotate', { schema: { summary: "Rotate a client's portal token", description: 'Invalidates the previous token and issues a new one.', params: fromZod(ClientIdParamsSchema), response: clientResponses.portalLinkRotate } }, async (request) => {
    const { id } = request.params as { id: string }
    const { shopId } = request.auth

    const client = await db.query.clients.findFirst({
      where: and(eq(clients.id, id), eq(clients.shopId, shopId)),
      columns: { id: true },
    })
    if (!client) throw { statusCode: 404, message: 'Client not found' }

    const rawToken = await db.transaction(async (tx) => {
      // Deactivate existing tokens
      await tx
        .update(clientPortalTokens)
        .set({ isActive: false, rotatedAt: new Date() })
        .where(and(
          eq(clientPortalTokens.clientId, id),
          eq(clientPortalTokens.isActive, true)
        ))

      const newRawToken = generatePortalToken()
      await tx.insert(clientPortalTokens).values({
        clientId: id,
        shopId,
        tokenHash: hashToken(newRawToken),
        tokenPrefix: getTokenPrefix(newRawToken),
      })

      return newRawToken
    })

    // Get shop slug
    const { shops } = await import('@stitchbook/db')
    const shop = await db.query.shops.findFirst({
      where: eq(shops.id, shopId),
      columns: { slug: true },
    })

    const portalUrl = `${process.env['PORTAL_URL']}/${shop?.slug}/client/${rawToken}`

    return {
      success: true,
      data: {
        portalUrl,
        rawToken,
        expiresAt: null, // Persistent tokens don't expire
        message: 'Save this URL — the full token is only shown once.',
      },
    }
  })

  // ── UPLOAD client photo ─────────────────────────────────────
  app.post('/:id/photo', { schema: { summary: 'Upload a client photo', description: 'Multipart file upload via `request.file()` — not a JSON body.', params: fromZod(ClientIdParamsSchema), consumes: ['multipart/form-data'], response: clientResponses.photoUpload } }, async (request) => {
    const { id } = request.params as { id: string }
    const { shopId } = request.auth

    const data = await request.file()
    if (!data) throw { statusCode: 400, message: 'No file uploaded' }

    const buffer = await data.toBuffer()
    const key = await app.storage.upload({
      shopId,
      category: 'clients',
      filename: data.filename,
      contentType: data.mimetype,
      body: buffer,
    })

    await db
      .update(clients)
      .set({ photoKey: key, updatedAt: new Date() })
      .where(and(eq(clients.id, id), eq(clients.shopId, shopId)))

    const photoUrl = await app.storage.getSignedUrl(key)
    return { success: true, data: { photoUrl, key } }
  })
}
