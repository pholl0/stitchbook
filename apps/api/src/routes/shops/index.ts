import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db, shops, portalShopBranding, workers } from '@stitchbook/db'
import { eq, and } from 'drizzle-orm'
import {
  fromZod,
  successEnvelope,
  responses,
  errorResponses,
} from '../../lib/schema.js'

const UpdateShopSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  currency: z.string().length(3).optional(),
  defaultUnit: z.enum(['cm', 'in', 'in_frac']).optional(),
  timezone: z.string().optional(),
  defaultFreshnessDays: z.number().min(30).max(730).optional(),
  defaultSeamAllowanceCm: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  country: z.string().optional(),
})

const UpdateBrandingSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  tagline: z.string().max(200).optional(),
  accentColour: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  fontPairing: z.string().optional(),
})

const ShopSubscriptionSchema = z.object({
  id: z.string().uuid(),
  shopId: z.string().uuid(),
  stripeCustomerId: z.string().nullable(),
  stripeSubscriptionId: z.string().nullable(),
  paystackCustomerCode: z.string().nullable(),
  paystackSubscriptionCode: z.string().nullable(),
  status: z.string(),
  planTier: z.string(),
  trialEndsAt: z.string().datetime().nullable(),
  currentPeriodStart: z.string().datetime().nullable(),
  currentPeriodEnd: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const ShopBrandingSchema = z.object({
  id: z.string().uuid(),
  shopId: z.string().uuid(),
  displayName: z.string(),
  tagline: z.string().nullable(),
  logoKey: z.string().nullable(),
  accentColour: z.string(),
  fontPairing: z.string(),
  customDomain: z.string().nullable(),
  hideStitchbookBranding: z.boolean(),
  customCss: z.string().nullable(),
  updatedAt: z.string().datetime(),
})

const ShopSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  currency: z.string(),
  defaultUnit: z.string(),
  timezone: z.string(),
  defaultFreshnessDays: z.number(),
  defaultSeamAllowanceCm: z.string(),
  planTier: z.string(),
  isActive: z.boolean(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  country: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  branding: ShopBrandingSchema.nullable(),
  subscription: ShopSubscriptionSchema.nullable(),
})

const shopResponses = {
  me: responses(successEnvelope(fromZod(ShopSchema, { title: 'Shop' }), { title: 'Current Shop Response' })),
  update: responses(successEnvelope(fromZod(ShopSchema, { title: 'Shop' }), { title: 'Update Shop Response' })),
  branding: responses(successEnvelope(fromZod(ShopBrandingSchema, { title: 'ShopBranding' }), { title: 'Update Shop Branding Response' })),
  logo: responses(successEnvelope(fromZod(z.object({ logoUrl: z.string() }), { title: 'ShopLogoUpload' }), { title: 'Upload Shop Logo Response' })),
}

export async function shopRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  // ── GET current shop ───────────────────────────────────────────
  app.get('/me', { schema: { summary: 'Get current shop', response: shopResponses.me } }, async (request) => {
    const { shopId } = request.auth
    const shop = await db.query.shops.findFirst({
      where: eq(shops.id, shopId),
      with: { branding: true, subscription: true },
    })
    if (!shop) throw { statusCode: 404, message: 'Shop not found' }
    return { success: true, data: shop }
  })

  // ── UPDATE shop settings ───────────────────────────────────────
  app.patch('/me', { schema: { summary: 'Update shop settings', body: fromZod(UpdateShopSchema), response: shopResponses.update } }, async (request) => {
    const body = UpdateShopSchema.parse(request.body)
    const { shopId, role } = request.auth

    if (role !== 'owner' && role !== 'manager') {
      throw { statusCode: 403, message: 'Only owners and managers can update shop settings' }
    }

    const [updated] = await db
      .update(shops)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(shops.id, shopId))
      .returning()

    return { success: true, data: updated }
  })

  // ── UPDATE branding ────────────────────────────────────────────
  app.patch('/me/branding', { schema: { summary: 'Update shop portal branding', description: 'fontPairing requires the Atelier plan; owner role required.', body: fromZod(UpdateBrandingSchema), response: shopResponses.branding } }, async (request) => {
    const body = UpdateBrandingSchema.parse(request.body)
    const { shopId, role, planTier } = request.auth

    if (role !== 'owner') throw { statusCode: 403, message: 'Only owners can update branding' }

    // Font pairing and custom domain are Atelier only
    if (body.fontPairing && planTier !== 'atelier') {
      throw { statusCode: 403, message: 'Font pairing requires the Atelier plan' }
    }

    const [updated] = await db
      .update(portalShopBranding)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(portalShopBranding.shopId, shopId))
      .returning()

    return { success: true, data: updated }
  })

  // ── UPLOAD shop logo ────────────────────────────────────────────
  app.post('/me/logo', { schema: { summary: 'Upload shop logo', description: 'Multipart file upload via `request.file()` — not a JSON body. Owner role required.', consumes: ['multipart/form-data'], response: shopResponses.logo } }, async (request) => {
    const { shopId, role } = request.auth
    if (role !== 'owner') throw { statusCode: 403, message: 'Only owners can upload a logo' }

    const file = await request.file()
    if (!file) throw { statusCode: 400, message: 'No file' }

    const buffer = await file.toBuffer()
    const key = await app.storage.upload({
      shopId,
      category: 'clients', // reuse clients bucket for shop assets
      filename: `logo_${file.filename}`,
      contentType: file.mimetype,
      body: buffer,
    })

    await db.update(portalShopBranding)
      .set({ logoKey: key })
      .where(eq(portalShopBranding.shopId, shopId))

    const url = await app.storage.getSignedUrl(key, 86400)
    return { success: true, data: { logoUrl: url } }
  })
}
