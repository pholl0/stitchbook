import fp from 'fastify-plugin'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '@stitchbook/db'
import { user, session, account, verification } from '@stitchbook/db/schema'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AuthContext } from '@stitchbook/types'
import type { IncomingMessage } from 'node:http'

const authSchema = { user, session, account, verification }

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
  emailAndPassword: { enabled: true },
  phoneNumber: {
    enabled: true,
    sendOTP: async ({ phoneNumber, otp }: any) => {
      // Dispatched via Twilio — handled in notifications plugin
      await globalThis.__stitchbookSendOtp?.(phoneNumber, otp)
    },
  },
  socialProviders: {
    google: {
      clientId: process.env['GOOGLE_CLIENT_ID']!,
      clientSecret: process.env['GOOGLE_CLIENT_SECRET']!,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // Update session if older than 1 day
  },
  trustedOrigins: [
    process.env['WEB_URL'] ?? 'http://localhost:3000',
    process.env['PORTAL_URL'] ?? 'http://localhost:3002',
  ],
})

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>
    auth: any
  }
  interface FastifyRequest {
    auth: AuthContext
  }
}

function nodeHeadersToWebHeaders(nodeHeaders: IncomingMessage['headers']): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else if (value !== undefined) {
      headers.set(key, value)
    }
  }
  return headers
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'content-length',
])

function fastifyToWebRequest(request: FastifyRequest): Request {
  const protocol = request.protocol ?? 'http'
  const host = request.headers.host ?? 'localhost'
  const url = `${protocol}://${host}${request.url}`
  const method = request.method ?? 'GET'
  const headers = nodeHeadersToWebHeaders(request.headers)

  const init: RequestInit = { method, headers }
  if (method !== 'GET' && method !== 'HEAD') {
    init.duplex = 'half'
    const body = request.body
    if (body !== undefined && body !== null) {
      if (typeof body === 'string') {
        init.body = body
      } else if (body instanceof Uint8Array || typeof (body as any).pipe === 'function') {
        init.body = body as any
      } else {
        // Fastify parsed object — re-serialize & make sure Content-Type matches
        init.body = JSON.stringify(body)
        const ct = headers.get('content-type')
        if (!ct || !ct.toLowerCase().includes('application/json')) {
          headers.set('content-type', 'application/json')
        }
      }
    }
  }
  return new Request(url, init)
}

export function makeAuthRequestCtx(request: FastifyRequest) {
  const headers = nodeHeadersToWebHeaders(request.headers)
  const protocol = request.protocol ?? 'http'
  const host = request.headers.host ?? 'localhost'
  return {
    headers,
    host,
    protocol,
    url: `${protocol}://${host}${request.url}`,
    method: request.method ?? 'GET',
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  // Mount Better Auth handler
  app.all('/auth/*', async (request, reply) => {
    const webRequest = fastifyToWebRequest(request)
    const response = await auth.handler(webRequest)
    reply.status(response.status)

    // Forward response headers, but never copy hop-by-hop or let stale
    // content-length override the size of the body we actually send.
    for (const [key, value] of response.headers.entries()) {
      const k = key.toLowerCase()
      if (HOP_BY_HOP.has(k)) continue
      reply.header(key, value)
    }

    // Handle redirects explicitly
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get('location')
      if (loc) {
        reply.status(response.status)
        return reply.redirect(loc)
      }
    }

    const contentType = response.headers.get('content-type') ?? ''
    const hasBody = response.body !== null && response.status !== 204 && response.status !== 304

    if (!hasBody) {
      return reply.send(undefined)
    }

    if (contentType.includes('application/json')) {
      let text = await response.text()
      if (!text) text = '{}'
      if (!reply.getHeader('content-type')) {
        reply.header('content-type', 'application/json; charset=utf-8')
      }
      return reply.send(text)
    }

    if (response.status >= 400) {
      const text = (await response.text()).trim()
      const message =
        text && text.length < 500 ? text : `Auth endpoint failed with status ${response.status}`
      reply.header('content-type', 'application/json; charset=utf-8')
      return reply.send(
        JSON.stringify({
          success: false,
          error: {
            code: `AUTH_HTTP_${response.status}`,
            message,
          },
        })
      )
    }

    const arrayBuf = await response.arrayBuffer()
    return reply.send(Buffer.from(arrayBuf))
  })

  // Expose the auth instance on the app so route handlers can call app.auth.api.*
  app.decorate('auth', auth)

  // Decorator for protected routes
  app.decorate('authenticate', async (request: FastifyRequest) => {
    const rawCookieValue = request.cookies?.['better-auth.session_token']
    const rawBearerValue = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    // Better Auth signs the session cookie as `${token}.${signature}` before
    // setting it (see auth/index.ts writeSetCookie). `session.token` in the
    // DB only ever stores the raw, unsigned token, so we have to strip the
    // signature suffix before comparing — otherwise every cookie-based
    // request fails with "Session expired" even for a perfectly valid
    // session. Genuinely raw bearer tokens (returned directly in the
    // sign-in/register JSON body, used by the mobile app) never contain a
    // '.', so stripping here is a no-op for them — but it also covers
    // server-side callers that forward the browser's signed cookie value
    // as a bearer token (e.g. Next.js server components reading the
    // cookie directly).
    const rawCookie = rawCookieValue?.split('.')[0]
    const rawBearer = rawBearerValue?.split('.')[0]
    const sessionToken = (rawCookie ?? rawBearer ?? '').trim()

    if (!sessionToken) {
      app.log.warn(
        {
          url: request.url,
          method: request.method,
          hasCookie: !!rawCookie,
          hasAuth: !!request.headers.authorization,
        },
        'Authenticate: no session token provided'
      )
      throw { statusCode: 401, message: 'Unauthorised' }
    }

    // Load worker context from DB + session/user rows directly.
    // NOTE: we deliberately do NOT call auth.api.getSession({ headers }) here.
    // Better Auth v1's getSession requires the value to be passed inside a
    // *signed & URL-encoded cookie string* — not the raw session token.
    // Passing headers.set('cookie', `better-auth.session_token=<raw>`)
    // always returns null. See:
    //   https://github.com/better-auth/better-auth/issues/4517
    // To avoid that, we read the session, user, worker and shop rows
    // via Drizzle using the raw token (which IS the stored `session.token`
    // column, per the Better Auth spec).
    const {
      db,
      session: sessionTable,
      user: userTable,
      workers,
      shops,
    } = await import('@stitchbook/db')
    const { eq, and, gt } = await import('drizzle-orm')

    const now = new Date()
    const rows = await db
      .select({
        sessionId: sessionTable.id,
        sessionExpiresAt: sessionTable.expiresAt,
        userId: userTable.id,
        userEmail: userTable.email,
        workerId: workers.id,
        workerAuthUserId: workers.authUserId,
        workerIsActive: workers.isActive,
        workerRole: workers.role,
        shopId: shops.id,
        shopPlanTier: shops.planTier,
      })
      .from(sessionTable)
      .innerJoin(userTable, eq(userTable.id, sessionTable.userId))
      .innerJoin(workers, eq(workers.authUserId, userTable.id))
      .innerJoin(shops, eq(shops.id, workers.shopId))
      .where(and(eq(sessionTable.token, sessionToken), gt(sessionTable.expiresAt, now)))
      .limit(1)

    const row = rows[0]

    if (!row) {
      app.log.warn(
        { tokenPreview: `${sessionToken.slice(0, 8)}…` },
        'Authenticate: no valid session+worker+shop row for token'
      )
      throw { statusCode: 401, message: 'Session expired' }
    }
    if (!row.workerIsActive) {
      app.log.warn(
        { workerId: row.workerId, userId: row.userId },
        'Authenticate: worker is inactive'
      )
      throw { statusCode: 403, message: 'Worker account not found or inactive' }
    }

    request.auth = {
      workerId: row.workerId,
      shopId: row.shopId,
      role: (row.workerRole as any) ?? 'worker',
      planTier: row.shopPlanTier,
    }
  })
})
