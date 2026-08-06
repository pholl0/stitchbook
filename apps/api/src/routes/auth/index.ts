import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { db, shops, workers, portalOtpTokens, portalShopBranding } from '@stitchbook/db'
import { eq, and } from 'drizzle-orm'
import { hashToken } from '@stitchbook/utils'
import { randomBytes } from 'crypto'
import { makeAuthRequestCtx } from '../../plugins/auth.js'
import type { IncomingMessage } from 'node:http'
import {
  fromZod,
  successEnvelope,
  responses,
  successOnlyResponse,
  errorResponses,
  type JsonSchema,
} from '../../lib/schema.js'

function toHeaders(request: FastifyRequest): Headers {
  const h = new Headers()
  for (const [key, value] of Object.entries(request.headers as IncomingMessage['headers'])) {
    if (Array.isArray(value)) {
      for (const v of value) h.append(key, v)
    } else if (value !== undefined) {
      h.set(key, value)
    }
  }
  return h
}

/** Serialize any error (including nested causes, Postgres/drizzle codes) into a plain object. */
function serializeError(err: any): {
  message: string
  code?: string
  detail?: any
  system?: {
    errno?: any
    code?: string
    syscall?: string
    address?: string
    port?: any
    hostname?: string
  }
} {
  if (!err) return { message: 'Unknown error' }

  const parts: string[] = []
  const pushMsg = (m: any) => {
    if (typeof m === 'string' && m) parts.push(m)
  }

  let cursor: any = err
  let depth = 0

  const codeAccum: string[] = []
  const detail: any = {}
  const system: {
    errno?: any
    code?: string
    syscall?: string
    address?: string
    port?: any
    hostname?: string
  } = {}

  while (cursor && depth < 6) {
    // Driver fields: take the first non-empty per key
    const trySet = <K extends keyof typeof detail>(key: K, v: any) => {
      if (detail[key] === undefined && v !== undefined) detail[key] = v
    }
    const c: any = cursor.code
    if (typeof c === 'string' && !codeAccum.includes(c)) codeAccum.push(c)
    const errno: any = cursor.errno
    if (errno !== undefined && system.errno === undefined) system.errno = errno
    const syscall: any = cursor.syscall
    if (typeof syscall === 'string' && !system.syscall) system.syscall = syscall
    const address: any = cursor.address
    if ((typeof address === 'string' || typeof address === 'number') && !system.address)
      system.address = String(address)
    const port: any = cursor.port
    if (port !== undefined && system.port === undefined) system.port = port
    const hostname: any = cursor.hostname
    if (typeof hostname === 'string' && !system.hostname) system.hostname = hostname

    // Drizzle / Postgres fields
    trySet('table', cursor.table)
    trySet('column', cursor.column)
    trySet('constraint', cursor.constraint)
    trySet('schema', cursor.schema)
    trySet('hint', cursor.hint)
    if (cursor.query && !detail.query) detail.query = String(cursor.query).slice(0, 400)
    if (cursor.parameters && !detail.parameters) detail.parameters = cursor.parameters
    // postgres.js / Node TLS connection fields
    if (cursor.connection) detail.connection = String(cursor.connection).slice(0, 200)
    if (cursor.severity) trySet('severity', cursor.severity)
    if (cursor.where) trySet('where', cursor.where)
    if (cursor.file) trySet('sourceFile', cursor.file)
    if (cursor.line) trySet('sourceLine', cursor.line)
    if (cursor.routine) trySet('routine', cursor.routine)

    pushMsg(cursor.message)
    pushMsg(cursor.msg)
    pushMsg(cursor.detail)
    pushMsg(cursor.hint)

    if (cursor === cursor.cause) break
    cursor = cursor.cause
    depth++
  }

  // Prefer real postgres error codes first, then system error codes
  const pgCodes = codeAccum.filter(
    c =>
      /^[0-9A-Z]{5}$/.test(c) ||
      c.startsWith('22') ||
      c.startsWith('23') ||
      c.startsWith('3D') ||
      c.startsWith('42')
  )
  const systemCodes = codeAccum.filter(c =>
    /^(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNRESET|EHOSTUNREACH|ECONNABORTED|EPIPE|EPROTO|CERT_|SELF_SIGNED|DEPTH_ZERO_SELF_SIGNED_CERT|HPE_|ENOTCONN|TLS_|CONNECT_TIMEOUT)$/.test(
      c
    )
  )
  const chosenCode = pgCodes[0] ?? systemCodes[0] ?? codeAccum[0] ?? undefined

  const message = [...new Set(parts.filter(Boolean))].join(' — ') || 'Unknown error'

  const out: ReturnType<typeof serializeError> = { message }
  if (chosenCode) out.code = chosenCode
  if (Object.keys(detail).length) out.detail = detail
  if (Object.keys(system).some(k => (system as any)[k] !== undefined)) out.system = system
  return out
}

function rethrowAuth(err: any, fallbackMessage: string, fallbackCode = 400): never {
  const info = serializeError(err)
  // Fastify error plugin reads these top-level keys
  throw {
    statusCode:
      typeof (err as any)?.statusCode === 'number' ? (err as any).statusCode : fallbackCode,
    message: info.message,
    error: info, // attach the full serialised payload so error plugin logs it
  } as any
}

const RegisterSchema = z.object({
  // Account
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8).max(128),
  // Shop
  shopName: z.string().min(2).max(100),
  country: z.string().length(2).or(z.literal('OTHER')),
  currency: z.string().length(3).toUpperCase(),
  defaultUnit: z.enum(['cm', 'in', 'in_frac']).default('cm'),
  specialty: z.string().max(100).optional(),
  plan: z.enum(['solo', 'boutique', 'atelier']).default('solo'),
})

const SignInEmailSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
})

const SignInResponseSchema = z.object({
  success: z.literal(true),
  token: z.string().nullable(),
  user: UserSchema,
})

const RegisterResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    shopId: z.string(),
    shopSlug: z.string(),
    planTier: z.string(),
    session: z.string().nullable(),
  }),
})

const AcceptInviteResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    workerId: z.string(),
    shopId: z.string(),
    session: z.string().nullable(),
  }),
})

const InviteDetailsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    shopName: z.string(),
    accentColour: z.string(),
    role: z.string(),
    invitedBy: z.string(),
    email: z.string(),
  }),
})

const SessionResponseSchema = z.object({
  session: z.record(z.string(), z.any()).nullable(),
})

const ForgotPasswordBodySchema = z.object({ email: z.string().email() })
const VerifyResetTokenQuerySchema = z.object({ token: z.string().optional() })
const ResetPasswordBodySchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
})
const AcceptInviteBodySchema = z.object({
  token: z.string().min(1),
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(128),
})
const AcceptInviteParamsSchema = z.object({ token: z.string() })
const AcceptInviteLegacyBodySchema = z.object({
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(128),
})
const InviteDetailsQuerySchema = z.object({ token: z.string().optional() })

const ValidTokenResponseSchema = z.object({
  valid: z.boolean(),
  error: z.string().optional(),
})

function writeSetCookie(reply: any, setCookieHeader: string | string[] | undefined | null) {
  if (!setCookieHeader) return
  const values = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]
  for (const v of values) reply.header('set-cookie', v)
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

const authResponses = {
  signInEmail: responses(fromZod(SignInResponseSchema, { title: 'SignInEmailResponse' })),
  signOut: responses(fromZod(z.object({ success: z.literal(true) }), { title: 'SignOutResponse' })),
  getSession: responses(fromZod(SessionResponseSchema, { title: 'GetSessionResponse' })),
  register: responses(fromZod(RegisterResponseSchema, { title: 'RegisterResponse' }), {
    statuses: [201],
  }),
  forgotPassword: responses(
    fromZod(z.object({ success: z.literal(true), message: z.string() }), {
      title: 'ForgotPasswordResponse',
    })
  ),
  verifyResetToken: responses(
    fromZod(ValidTokenResponseSchema, { title: 'VerifyResetTokenResponse' })
  ),
  resetPassword: responses(
    fromZod(z.object({ success: z.literal(true) }), { title: 'ResetPasswordResponse' })
  ),
  acceptInvite: responses(fromZod(AcceptInviteResponseSchema, { title: 'AcceptInviteResponse' }), {
    statuses: [201],
  }),
  inviteDetails: responses(
    fromZod(InviteDetailsResponseSchema, { title: 'InviteDetailsResponse' })
  ),
}

export async function authRoutes(app: FastifyInstance) {
  // ── POST /auth/sign-in/email ───────────────────────────────
  app.post(
    '/sign-in/email',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Sign in with email + password (returns JSON session token)',
        body: fromZod(SignInEmailSchema),
        response: authResponses.signInEmail,
      },
    },
    async (request, reply) => {
      const rawBody = SignInEmailSchema.parse(request.body)
      const body = { ...rawBody, email: normalizeEmail(rawBody.email) }
      const ctx = makeAuthRequestCtx(request)

      let result: any
      try {
        // `returnHeaders: true` is required to get back the Set-Cookie
        // header better-auth generates — without it, the call returns the
        // plain response body only and no cookie is ever set on the client.
        result = await app.auth.api.signInEmail({
          ...ctx,
          body,
          asResponse: false,
          returnHeaders: true,
        })
      } catch (err) {
        rethrowAuth(err, 'Invalid email or password', 401)
      }

      // With returnHeaders: true, the shape is { headers, response } —
      // `response` holds the data (user/session/token), `headers` holds
      // the Set-Cookie header.
      const data = result?.response ?? result

      if (!data || !data.user) {
        throw { statusCode: 401, message: 'Invalid email or password' }
      }

      writeSetCookie(reply, result?.headers?.getSetCookie?.() ?? null)

      const sessionToken =
        (data.token as string | null) ??
        (data.session?.token as string | null) ??
        (data.session as string | null) ??
        null

      if (!sessionToken) {
        app.log.error(
          { email: body.email, keys: Object.keys(data) },
          'signInEmail returned no token path'
        )
        throw { statusCode: 500, message: 'Sign-in succeeded but no session token was produced' }
      }

      return {
        success: true,
        token: sessionToken,
        user: { id: data.user.id, email: data.user.email, name: data.user.name },
      }
    }
  )

  // ── POST /auth/sign-out ───────────────────────────────────────
  app.post(
    '/sign-out',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Sign out (clear session cookie / token)',
        response: authResponses.signOut,
      },
    },
    async (request, reply) => {
      const headers = toHeaders(request)

      // returnHeaders: true is required to get the Set-Cookie (clearing)
      // header back — see the /sign-in/email handler above for why.
      try {
        const out: any = await app.auth.api.signOut({
          headers,
          body: undefined,
          asResponse: false,
          returnHeaders: true,
        })
        writeSetCookie(reply, out?.headers?.getSetCookie?.() ?? null)
      } catch {
        // Fallback: force-delete the session cookie ourselves
        reply.header(
          'set-cookie',
          'better-auth.session_token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax'
        )
      }

      return { success: true }
    }
  )

  // ── GET /auth/get-session ───────────────────────────────────
  app.get(
    '/get-session',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Get the currently authenticated session',
        response: authResponses.getSession,
      },
    },
    async (request, reply) => {
      try {
        const headers = toHeaders(request)
        const session = await app.auth.api.getSession({ headers })
        if (!session) return reply.status(401).send({ session: null })
        return { session }
      } catch (err) {
        rethrowAuth(err, 'Could not read session')
      }
    }
  )

  // ── POST /auth/register ─────────────────────────────────────
  app.post(
    '/register',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Register a new shop & owner account',
        body: fromZod(RegisterSchema),
        response: authResponses.register,
      },
    },
    async (request, reply) => {
      const rawBody = RegisterSchema.parse(request.body)
      const body = { ...rawBody, email: normalizeEmail(rawBody.email) }
      const ctx = makeAuthRequestCtx(request)

      // 1. Create the Better Auth user (handles password hashing)
      let signUpResult: any
      try {
        signUpResult = await app.auth.api.signUpEmail({
          ...ctx,
          body: {
            name: body.name,
            email: body.email,
            password: body.password,
            callbackURL: '/dashboard',
          },
          asResponse: false,
        })
      } catch (err) {
        rethrowAuth(err, 'Could not create account. Email may already be in use.', 422)
      }

      if (!signUpResult || !(signUpResult as any).user) {
        throw { statusCode: 422, message: 'Could not create account. Email may already be in use.' }
      }

      const authUser = (signUpResult as any).user

      // 2. Create shop + owner worker in a single transaction
      const shopSlug =
        body.shopName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 48) +
        '-' +
        randomBytes(3).toString('hex')

      const [newShop] = await db.transaction(async tx => {
        const [shop] = await tx
          .insert(shops)
          .values({
            name: body.shopName,
            slug: shopSlug,
            country: body.country,
            currency: body.currency,
            defaultUnit: body.defaultUnit,
            planTier: body.plan,
            trialEndsAt:
              body.plan !== 'solo' ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : null,
          } as any)
          .returning()
        if (!shop) throw new Error('Shop creation failed — transaction rolled back')

        await tx.insert(workers).values({
          shopId: shop.id,
          authUserId: authUser.id,
          name: body.name,
          email: body.email,
          phone: body.phone,
          role: 'owner' as any,
          isActive: true,
        } as any)

        await tx.insert(portalShopBranding).values({
          shopId: shop.id,
          displayName: body.shopName,
          accentColour: '#b5522a',
        } as any)

        return [shop]
      })

      // 3. Sign the user in immediately
      const sessionResult: any = await app.auth.api.signInEmail({
        ...ctx,
        body: { email: body.email, password: body.password },
        asResponse: false,
        returnHeaders: true,
      })

      const sessionData = sessionResult?.response ?? sessionResult
      writeSetCookie(reply, sessionResult?.headers?.getSetCookie?.() ?? null)

      const sessionToken =
        (sessionData?.token as string | null) ??
        (sessionData?.session?.token as string | null) ??
        (sessionData?.session as string | null) ??
        null

      if (!sessionToken) {
        app.log.error(
          { email: body.email, keys: sessionData ? Object.keys(sessionData) : null },
          'register auto signInEmail returned no token path'
        )
        throw {
          statusCode: 500,
          message: 'Account created but sign-in failed. Please try logging in.',
        }
      }

      reply.code(201)
      return {
        success: true,
        data: {
          shopId: newShop?.id ?? '',
          shopSlug: newShop?.slug ?? '',
          planTier: newShop!.planTier,
          session: sessionToken,
        },
      }
    }
  )

  // ── POST /auth/forgot-password ─────────────────────────────────
  app.post(
    '/forgot-password',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Request a password reset email',
        description: 'Always returns 200 regardless of whether the email exists, to avoid leaking account existence.',
        body: fromZod(ForgotPasswordBodySchema),
        response: authResponses.forgotPassword,
      },
    },
    async request => {
      const { email } = ForgotPasswordBodySchema.parse(request.body)
      const headers = toHeaders(request)

      // Always return 200 — never reveal whether email exists
      try {
        await app.auth.api.forgetPassword({
          headers,
          body: {
            email: normalizeEmail(email),
            redirectTo: `${process.env['WEB_URL']}/reset-password`,
          },
          asResponse: false,
        })
      } catch {
        // Swallow — do not leak existence
      }

      return { success: true, message: 'If an account exists, a reset link has been sent.' }
    }
  )

  // ── GET /auth/verify-reset-token ─────────────────────────────
  // Called by the reset-password page on mount to validate token before showing the form
  app.get(
    '/verify-reset-token',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Verify a password-reset token',
        querystring: fromZod(VerifyResetTokenQuerySchema),
        response: authResponses.verifyResetToken,
      },
    },
    async (request, reply) => {
      const { token } = request.query as { token?: string }
      if (!token) return reply.status(400).send({ valid: false, error: 'Token missing' })

      try {
        // Better Auth exposes token verification — attempt to decode without consuming
        const result = await app.auth.api.verifyPasswordResetToken?.({
          query: { token },
          asResponse: false,
        })
        if (!result) {
          // Fallback: if verifyPasswordResetToken isn't exposed, just return valid=true
          // The reset attempt itself will validate the token
          return { valid: true }
        }
        return { valid: true }
      } catch {
        return reply.status(400).send({ valid: false, error: 'Token invalid or expired' })
      }
    }
  )

  // ── POST /auth/reset-password ──────────────────────────────────
  app.post(
    '/reset-password',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Reset password using token',
        body: fromZod(ResetPasswordBodySchema),
        response: authResponses.resetPassword,
      },
    },
    async (request, reply) => {
      const body = ResetPasswordBodySchema.parse(request.body)
      const headers = toHeaders(request)

      try {
        await app.auth.api.resetPassword({
          headers,
          body: { token: body.token, newPassword: body.newPassword },
          asResponse: false,
        })
        return { success: true }
      } catch (err: any) {
        throw {
          statusCode: 400,
          message: err?.message ?? 'Reset failed. Your link may have expired.',
        }
      }
    }
  )

  // ── POST /auth/accept-invite ──────────────────
  // Worker sets their own name and password, creating their auth account
  // Accepts token either in the URL path param OR in the JSON body (for client convenience).
  app.post(
    '/accept-invite',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Accept a worker invite and create account (token in body)',
        body: fromZod(AcceptInviteBodySchema),
        response: authResponses.acceptInvite,
      },
    },
    async (request, reply) => {
      const { token, name, password } = AcceptInviteBodySchema.parse(request.body)
      const ctx = makeAuthRequestCtx(request)
      const tokenHash = hashToken(token)

      const otp = await db.query.portalOtpTokens.findFirst({
        where: and(
          eq(portalOtpTokens.tokenHash, tokenHash),
          eq(portalOtpTokens.tokenType, 'worker_invite' as any)
        ),
      })

      if (!otp || otp.usedAt || new Date(otp.expiresAt) < new Date()) {
        throw { statusCode: 410, message: 'Invite link has expired or already been used.' }
      }

      const worker = await db.query.workers.findFirst({
        where: eq(workers.id, otp.resourceId!),
      })

      if (!worker || worker.authUserId) {
        throw { statusCode: 409, message: 'This invite has already been accepted.' }
      }

      const signUpResult = await app.auth.api.signUpEmail({
        ...ctx,
        body: {
          name,
          email: normalizeEmail(worker.email!),
          password,
          callbackURL: '/',
        },
        asResponse: false,
      })

      const authUser = (signUpResult as any)?.user
      if (!authUser) {
        throw { statusCode: 422, message: 'Could not create account.' }
      }

      await db.transaction(async tx => {
        await tx
          .update(workers)
          .set({ authUserId: authUser.id, name, isActive: true })
          .where(eq(workers.id, worker.id))
        await tx
          .update(portalOtpTokens)
          .set({ usedAt: new Date() })
          .where(eq(portalOtpTokens.id, otp.id))
      })

      const sessionResult: any = await app.auth.api.signInEmail({
        ...ctx,
        body: { email: normalizeEmail(worker.email!), password },
        asResponse: false,
      })

      if (sessionResult?.response) {
        writeSetCookie(reply, sessionResult.response.headers?.getSetCookie?.() ?? null)
      }

      return {
        success: true,
        data: {
          workerId: worker.id,
          shopId: worker.shopId,
          session: (sessionResult as any)?.token ?? null,
        },
      }
    }
  )

  // Deprecated path-param variant (kept for back-compat with any old callers)
  app.post(
    '/accept-invite/:token',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Accept a worker invite (token in URL path, deprecated)',
        params: fromZod(AcceptInviteParamsSchema),
        body: fromZod(AcceptInviteLegacyBodySchema),
        response: authResponses.acceptInvite,
      },
    },
    async (request, reply) => {
      const { token } = request.params as { token: string }
      const body = AcceptInviteLegacyBodySchema.parse(request.body)
      const ctx = makeAuthRequestCtx(request)

      const tokenHash = hashToken(token)

      const otp = await db.query.portalOtpTokens.findFirst({
        where: and(
          eq(portalOtpTokens.tokenHash, tokenHash),
          eq(portalOtpTokens.tokenType, 'worker_invite' as any)
        ),
      })

      if (!otp || otp.usedAt || new Date(otp.expiresAt) < new Date()) {
        throw { statusCode: 410, message: 'Invite link has expired or already been used.' }
      }

      // Load the pending worker record to get their email
      const worker = await db.query.workers.findFirst({
        where: eq(workers.id, otp.resourceId!),
      })

      if (!worker || worker.authUserId) {
        throw { statusCode: 409, message: 'This invite has already been accepted.' }
      }

      // Create Better Auth user
      const signUpResult = await app.auth.api.signUpEmail({
        ...ctx,
        body: {
          name: body.name,
          email: normalizeEmail(worker.email!),
          password: body.password,
          callbackURL: '/',
        },
        asResponse: false,
      })

      const authUser = (signUpResult as any)?.user
      if (!authUser) {
        throw { statusCode: 422, message: 'Could not create account.' }
      }

      // Link auth user to worker record + mark token used
      await db.transaction(async tx => {
        await tx
          .update(workers)
          .set({
            authUserId: authUser.id,
            name: body.name,
            isActive: true,
          })
          .where(eq(workers.id, worker.id))

        await tx
          .update(portalOtpTokens)
          .set({
            usedAt: new Date(),
          })
          .where(eq(portalOtpTokens.id, otp.id))
      })

      // Sign in immediately
      const sessionResult = await app.auth.api.signInEmail({
        ...ctx,
        body: { email: normalizeEmail(worker.email!), password: body.password },
        asResponse: false,
      })

      return {
        success: true,
        data: {
          workerId: worker.id,
          shopId: worker.shopId,
          session: (sessionResult as any)?.token,
        },
      }
    }
  )

  // ── GET /auth/invite-details ─────────────────────────────────
  // Called by the accept-invite page on mount to render the shop context card
  app.get(
    '/invite-details',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Get invite details for accept-invite page',
        querystring: fromZod(InviteDetailsQuerySchema),
        response: authResponses.inviteDetails,
      },
    },
    async (request, reply) => {
      const { token } = request.query as { token?: string }
      if (!token) return reply.status(400).send({ success: false, error: 'Token missing' })

      const tokenHash = hashToken(token)

      const otp = await db.query.portalOtpTokens.findFirst({
        where: and(
          eq(portalOtpTokens.tokenHash, tokenHash),
          eq(portalOtpTokens.tokenType, 'worker_invite' as any)
        ),
      })

      if (!otp || otp.usedAt || new Date(otp.expiresAt) < new Date()) {
        return reply.status(410).send({ success: false, error: 'Invite not found or expired' })
      }

      const [worker, branding, invitedByWorker] = await Promise.all([
        db.query.workers.findFirst({
          where: eq(workers.id, otp.resourceId!),
          with: { shop: { columns: { id: true, name: true } } },
        }),
        db.query.portalShopBranding.findFirst({
          where: eq(portalShopBranding.shopId, otp.shopId),
          columns: { displayName: true, accentColour: true },
        }),
        db.query.workers.findFirst({
          where: eq(workers.id, otp.createdBy!),
          columns: { name: true },
        }),
      ])

      if (!worker)
        return reply.status(404).send({ success: false, error: 'Worker record not found' })

      return {
        success: true,
        data: {
          shopName: branding?.displayName ?? (worker as any).shop?.name ?? 'Your shop',
          accentColour: branding?.accentColour ?? '#b5522a',
          role: worker.role,
          invitedBy: invitedByWorker?.name ?? 'Shop owner',
          email: worker.email ?? '',
        },
      }
    }
  )
}
