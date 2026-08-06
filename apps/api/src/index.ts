import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import websocket from '@fastify/websocket'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import rawBody from 'fastify-raw-body'
import { pingDb, dbConnectionInfo } from '@stitchbook/db'

import { authPlugin } from './plugins/auth.js'
import { redisPlugin } from './plugins/redis.js'
import { storagePlugin } from './plugins/storage.js'
import { notificationsPlugin } from './plugins/notifications.js'
import { idempotencyPlugin } from './plugins/idempotency.js'
import { rateLimitPlugin } from './plugins/rateLimit.js'
import { cachePlugin } from './plugins/cache.js'
import { errorHandlerPlugin } from './plugins/errorHandler.js'
import { requestLoggerPlugin } from './plugins/requestLogger.js'
import {
  errorResponses as buildErrorResponses,
  noContentResponse,
  successOnlyResponse,
  successEnvelope,
  type JsonSchema,
} from './lib/schema.js'

import { authRoutes } from './routes/auth/index.js'
import { clientRoutes } from './routes/clients/index.js'
import { measurementRoutes } from './routes/measurements/index.js'
import { orderRoutes } from './routes/orders/index.js'
import { shopRoutes } from './routes/shops/index.js'
import { workerRoutes } from './routes/workers/index.js'
import { inventoryRoutes } from './routes/inventory/index.js'
import { portalRoutes } from './routes/portal/index.js'
import { webhookRoutes } from './routes/webhooks/index.js'
import { analyticsRoutes } from './routes/analytics/index.js'
import { notificationRoutes } from './routes/notifications/index.js'
import { pdfRoutes } from './routes/pdf/index.js'
import { syncRoutes } from './routes/sync/index.js'
import { onboardingRoutes } from './routes/onboarding/index.js'
import { superAdminRoutes } from './routes/superadmin/index.js'

const PORT = Number(process.env['PORT'] ?? 3001)
const HOST = process.env['HOST'] ?? '0.0.0.0'
const IS_DEV = process.env['NODE_ENV'] === 'development'

const genericObjectSchema = (): JsonSchema => ({
  title: 'Generic Object',
  description: 'Arbitrary object payload',
  type: 'object',
  additionalProperties: { type: ['string', 'number', 'boolean', 'object', 'array', 'null'] },
  example: { id: '00000000-0000-0000-0000-000000000000', name: 'Example' },
})

const genericArraySchema = (): JsonSchema => ({
  title: 'Generic List',
  description: 'List of arbitrary objects',
  type: 'array',
  items: genericObjectSchema(),
  example: [{ id: '00000000-0000-0000-0000-000000000000', name: 'Example' }],
})

const paginatedListSchema = (itemSchema?: JsonSchema): JsonSchema => ({
  title: 'Paginated List',
  description: 'Paginated list wrapper used on collection GETs with page/pageSize params.',
  type: 'object',
  properties: {
    items: { type: 'array', items: itemSchema ?? genericObjectSchema(), description: 'Records on the current page' },
    total: { type: 'integer', minimum: 0, description: 'Total records across all pages' },
    page: { type: 'integer', minimum: 1, description: 'Current page number' },
    pageSize: { type: 'integer', minimum: 1, maximum: 100, description: 'Page size requested' },
    hasMore: { type: 'boolean', description: 'Whether a next page exists' },
  },
  required: ['items', 'total', 'page', 'pageSize', 'hasMore'],
  additionalProperties: false,
})


function successSchema(
  data: JsonSchema = genericObjectSchema(),
  opts: { titlePrefix?: string; description?: string } = {}
): JsonSchema {
  const title = opts.titlePrefix ? `${opts.titlePrefix} Response` : 'Success Response'
  return {
    title,
    description: opts.description ?? `Successful operation, wraps a result in the \`data\` field.`,
    type: 'object',
    properties: {
      success: { type: 'boolean', enum: [true] },
      data,
    },
    required: ['success', 'data'],
    additionalProperties: false,
  }
}

function inferSwaggerTag(url: string): string {
  if (url.startsWith('/auth')) return 'Auth'
  if (url.startsWith('/api/clients')) return 'Clients'
  if (url.startsWith('/api/orders')) return 'Orders'
  if (url.startsWith('/api/measurements')) return 'Measurements'
  if (url.startsWith('/api/shops')) return 'Shops'
  if (url.startsWith('/api/workers')) return 'Workers'
  if (url.startsWith('/api/inventory')) return 'Inventory'
  if (url.startsWith('/portal')) return 'Portal'
  if (url.startsWith('/webhooks')) return 'Webhooks'
  if (url.startsWith('/api/analytics')) return 'Analytics'
  if (url.startsWith('/api/onboarding')) return 'Onboarding'
  if (url.startsWith('/api/admin')) return 'Admin'
  if (url.startsWith('/api/sync')) return 'Sync'
  if (url.startsWith('/api/pdf')) return 'PDF'
  if (url.startsWith('/api/notifications') || url.startsWith('/api/feed')) return 'Notifications'
  if (url === '/health') return 'System'
  return 'System'
}

function inferSuccessDataSchema(
  method: string,
  url: string
): {
  dataSchema: JsonSchema
  titlePrefix: string
  description: string
  envelope: 'success-data' | 'success-only' | 'raw' | 'pdf'
} {
  const normalizedMethod = method.toUpperCase()

  if (url.startsWith('/api/pdf/')) {
    return {
      dataSchema: {
        $id: 'Stitchbook.PdfBinary',
        title: 'PDF binary',
        description: 'Binary PDF document, served via application/pdf',
        type: 'string',
        format: 'binary',
      },
      titlePrefix: `${normalizedMethod} ${url}`,
      description: 'Returns a PDF document as application/pdf binary payload.',
      envelope: 'pdf',
    }
  }

  if (url === '/health') {
    return {
      dataSchema: {
        $id: 'Stitchbook.Health',
        title: 'Service Health',
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok', 'degraded'] },
          version: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          db: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              host: { type: 'string' },
              database: { type: 'string' },
              ssl: { type: 'boolean' },
              error: {
                type: 'object',
                description: 'Present only when ok=false. Contains socket info + error message.',
                properties: {
                  message: { type: 'string' },
                  code: { type: 'string' },
                  hostname: { type: 'string' },
                  port: { type: 'integer' },
                },
                additionalProperties: true,
              },
            },
            required: ['ok', 'host', 'database', 'ssl'],
            additionalProperties: false,
          },
        },
        required: ['status', 'version', 'timestamp', 'db'],
        additionalProperties: false,
      },
      titlePrefix: 'Health Check',
      description: 'Reports service + database liveness. No success/data wrapper.',
      envelope: 'raw',
    }
  }

  if (normalizedMethod === 'DELETE') {
    return {
      dataSchema: successOnlyResponse({ title: `${normalizedMethod} ${url} Success` }),
      titlePrefix: `${normalizedMethod} ${url}`,
      description: 'Delete operations return a bare success envelope with no data field.',
      envelope: 'success-only',
    }
  }

  // ── Known list-style endpoints ────────────────────────────
  const isKnownList =
    url.includes('/board/') ||
    url.includes('/templates') ||
    url.includes('/top-garments') ||
    url.includes('/funnel') ||
    url.includes('/revenue') ||
    url.includes('/retention') ||
    url.includes('/rework-rate') ||
    url.includes('/fabric-utilisation') ||
    url.endsWith('/feed')

  // GET with no param segments and not a /me /status /overview singleton → list
  const isCollectionGet =
    normalizedMethod === 'GET' &&
    !url.includes('/:') &&
    !url.endsWith('/me') &&
    !url.endsWith('/status') &&
    !url.endsWith('/overview')

  const isPaginatedCollection =
    normalizedMethod === 'GET' &&
    (url === '/api/clients' ||
      url === '/api/orders' ||
      url === '/api/workers' ||
      url.startsWith('/api/clients?') ||
      url.startsWith('/api/orders?'))

  if (isPaginatedCollection) {
    return {
      dataSchema: paginatedListSchema(),
      titlePrefix: `List ${url}`,
      description: 'Paginated collection. Includes items/total/page/pageSize/hasMore inside data.',
      envelope: 'success-data',
    }
  }

  if (isKnownList || isCollectionGet) {
    return {
      dataSchema: genericArraySchema(),
      titlePrefix: `List ${url}`,
      description: 'Non-paginated list of records returned as data: array.',
      envelope: 'success-data',
    }
  }

  // POST / PATCH with create/update semantics → object data
  if (normalizedMethod === 'POST' || normalizedMethod === 'PATCH' || normalizedMethod === 'PUT') {
    return {
      dataSchema: genericObjectSchema(),
      titlePrefix: `${normalizedMethod} ${url}`,
      description: 'Mutation. Returns the created/updated resource in data.',
      envelope: 'success-data',
    }
  }

  // GET /:id-style resource detail, /me, /status, /overview → object data
  return {
    dataSchema: genericObjectSchema(),
    titlePrefix: `Get ${url}`,
    description: 'Single resource detail. Returns a single object inside data.',
    envelope: 'success-data',
  }
}

function buildDefaultResponses(method: string, url: string): Record<string, JsonSchema> {
  const { dataSchema, titlePrefix, description, envelope } = inferSuccessDataSchema(method, url)
  const responses: Record<string, JsonSchema> = buildErrorResponses()

  if (envelope === 'raw') {
    responses['200'] = dataSchema
    return responses
  }

  if (envelope === 'pdf') {
    responses['200'] = dataSchema
    responses['201'] = dataSchema
    return responses
  }

  if (envelope === 'success-only') {
    // DELETE / bare success — no `data` wrapper
    responses['200'] = dataSchema
    responses['201'] = dataSchema
    responses['204'] = noContentResponse
    return responses
  }

  // envelope === 'success-data'
  const wrapped = successSchema(dataSchema, { titlePrefix, description })
  responses['200'] = wrapped
  responses['201'] = wrapped
  responses['204'] = noContentResponse

  return responses
}

function isProtectedUrl(url: string): boolean {
  if (url === '/health') return false
  if (url.startsWith('/auth')) return false
  if (url.startsWith('/portal')) return false
  if (url.startsWith('/webhooks')) return false
  // /api/sync/pull and push are authenticated but let's be conservative:
  // match all /api/* and /api/sync/* as protected except the explicit public above
  if (url.startsWith('/api')) return true
  return false
}

export async function buildServer() {
  const app = Fastify({
    logger: IS_DEV ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : true,
    trustProxy: true,
  })

  // ── Security headers ────────────────────────────────────────
  // NOTE: Cross-origin isolation headers (Cross-Origin-Opener-Policy,
  // Cross-Origin-Embedder-Policy, Cross-Origin-Resource-Policy,
  // Origin-Agent-Cluster) are only meaningful on "potentially trustworthy"
  // origins = HTTPS OR localhost. On dev we frequently access the API via a
  // raw private IPv4 (e.g. http://172.26.48.1:3001), which Chrome treats as
  // untrustworthy — the headers are then ignored and console errors are
  // emitted, sometimes conflicting with previously cached site-keyed agent
  // clusters. So disable them outside production.
  await app.register(helmet, {
    crossOriginOpenerPolicy: IS_DEV ? false : true,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: IS_DEV ? false : { policy: 'same-site' },
    originAgentCluster: IS_DEV ? false : true,
    referrerPolicy: { policy: ['strict-origin-when-cross-origin'] },
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...(IS_DEV ? ["'unsafe-inline'", "'unsafe-eval'"] : [])],
        styleSrc: ["'self'", "'unsafe-inline'", ...(IS_DEV ? ['https:'] : [])],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", ...(IS_DEV ? ['ws:', 'wss:', 'https:'] : [])],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: IS_DEV ? ["'self'"] : ["'none'"],
        // NEVER enable upgrade-insecure-requests on plain-HTTP dev servers:
        // every subresource gets rewritten to https://, causing
        // ERR_SSL_PROTOCOL_ERROR against a non-TLS listener.
        ...(IS_DEV ? {} : { upgradeInsecureRequests: [] }),
      },
    },
  })

  // ── Swagger-UI CSP override ────────────────────────────────
  // @fastify/swagger-ui injects an inline bootstrapper and inlines styles.
  // For the /docs prefix only, we set a permissive CSP, ensuring we do NOT
  // force https upgrade on dev private-IP origins.
  app.addHook('onRequest', (req, reply, done) => {
    const path = (req.raw.url ?? '').split('?')[0] ?? ''
    if (path === '/docs' || path.startsWith('/docs/')) {
      reply.header(
        'content-security-policy',
        "default-src 'self'; " +
          "base-uri 'self'; " +
          "font-src 'self' data:; " +
          "img-src 'self' data:; " +
          "object-src 'none'; " +
          "script-src 'self' 'unsafe-inline'; " +
          "script-src-attr 'none'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "frame-ancestors 'none'; " +
          "connect-src 'self';"
      )
    }
    done()
  })

  // ── CORS ────────────────────────────────────────────────────
  const allowedOrigins = [
    process.env['WEB_URL'],
    process.env['PORTAL_URL'],
    // Allow localhost only outside production
    ...(process.env['NODE_ENV'] !== 'production'
      ? ['http://localhost:3000', 'http://localhost:3002', 'http://localhost:3001']
      : []),
  ].filter(Boolean) as string[]

  if (process.env['NODE_ENV'] === 'production' && allowedOrigins.length === 0) {
    throw new Error('WEB_URL and PORTAL_URL env vars must be set in production')
  }

  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
  })

  // ── Cookie parser (required by Better Auth session reading) ─
  await app.register(cookie, {
    secret: process.env['COOKIE_SECRET'] ?? process.env['JWT_SECRET']!,
  })

  // ── Raw body capture (required for Stripe webhook verification)
  await app.register(rawBody, {
    field: 'rawBody',
    global: false, // opt-in per route, not global
    encoding: false, // keep as Buffer
    runFirst: true,
  })

  // ── File uploads ────────────────────────────────────────────
  await app.register(multipart, {
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  })

  // ── WebSocket ───────────────────────────────────────────────
  await app.register(websocket)

  // ── OpenAPI docs ─────────────────────────────────────────────
  if (IS_DEV) {
    await app.register(swagger, {
      openapi: {
        info: { title: 'StitchBook API', version: '1.0.0', description: 'StitchBook Backend API' },
        servers: [{ url: `http://localhost:${PORT}`, description: 'Dev server' }],
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
        tags: [
          { name: 'Auth', description: 'Registration, login, and password management' },
          { name: 'Clients', description: 'Client management' },
          { name: 'Orders', description: 'Orders, garment items, and fitting sessions' },
          { name: 'Measurements', description: 'Measurement sessions and templates' },
          { name: 'Shops', description: 'Shop and branding settings' },
          { name: 'Workers', description: 'Worker management and invites' },
          { name: 'Inventory', description: 'Fabrics, suppliers, and stock' },
          { name: 'Portal', description: 'Client-facing portal endpoints' },
          { name: 'Notifications', description: 'SMS/email notification triggers' },
          { name: 'PDF', description: 'PDF generation endpoints' },
          { name: 'Analytics', description: 'Shop analytics and reports' },
          { name: 'Onboarding', description: 'Onboarding flow' },
          { name: 'Admin', description: 'Superadmin endpoints' },
          { name: 'Webhooks', description: 'Stripe and Paystack webhooks' },
          { name: 'Sync', description: 'Offline sync endpoints' },
          { name: 'System', description: 'Operational and health endpoints' },
        ],
      },
      hideUntagged: false,
    })
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: true },
    })
  }

  app.addHook('onRoute', (routeOptions: any) => {
    const url = String(routeOptions.url ?? '')
    const method = Array.isArray(routeOptions.method)
      ? String(routeOptions.method[0] ?? 'GET')
      : String(routeOptions.method ?? 'GET')

    routeOptions.schema ??= {}
    const schema = routeOptions.schema as Record<string, any>

    // 1) Tags — preserve explicit tags; otherwise infer from URL prefix
    if (!Array.isArray(schema.tags) || schema.tags.length === 0) {
      schema.tags = [inferSwaggerTag(url)]
    }

    // 2) Security — only attach bearerAuth security requirement for protected prefixes
    if (schema.security === undefined && isProtectedUrl(url)) {
      schema.security = [{ bearerAuth: [] }]
    }

    // 3) Response defaults — merge, do not overwrite
    const defaults = buildDefaultResponses(method, url)
    schema.response ??= {}
    for (const [status, defaultSchema] of Object.entries(defaults)) {
      if (schema.response[status] === undefined) {
        schema.response[status] = defaultSchema
      }
    }

    // 4) PDF endpoints: advertise `content: application/pdf` on 200/201 when response is still the default binary schema (i.e. not overridden)
    if (url.startsWith('/api/pdf/')) {
      for (const status of ['200', '201']) {
        const resp = schema.response?.[status]
        if (
          resp &&
          typeof resp === 'object' &&
          !('content' in resp) &&
          !('description' in resp) &&
          (resp as any).type === 'string' &&
          (resp as any).format === 'binary'
        ) {
          schema.response[status] = {
            description: 'PDF binary response',
            content: {
              'application/pdf': { schema: resp },
            },
          }
        }
      }
    }
  })

  // ── Core plugins ────────────────────────────────────────────
  // Order matters: redis → auth → rate-limit → cache → idempotency → error handler → logger
  await app.register(redisPlugin)
  await app.register(storagePlugin)
  await app.register(authPlugin)
  await app.register(notificationsPlugin)

  // ── Phase 3 hardening plugins ───────────────────────────────
  await app.register(errorHandlerPlugin) // must be first — sets global error handler
  await app.register(requestLoggerPlugin)
  await app.register(rateLimitPlugin) // after redisPlugin
  await app.register(cachePlugin) // after redisPlugin
  await app.register(idempotencyPlugin) // after redisPlugin

  // ── Routes ──────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(clientRoutes, { prefix: '/api/clients' })
  await app.register(measurementRoutes, { prefix: '/api/measurements' })
  await app.register(orderRoutes, { prefix: '/api/orders' })
  await app.register(shopRoutes, { prefix: '/api/shops' })
  await app.register(workerRoutes, { prefix: '/api/workers' })
  await app.register(inventoryRoutes, { prefix: '/api/inventory' })
  await app.register(portalRoutes, { prefix: '/portal' })
  await app.register(webhookRoutes, { prefix: '/webhooks' })
  await app.register(analyticsRoutes, { prefix: '/api/analytics' })
  await app.register(notificationRoutes, { prefix: '/api' })
  await app.register(pdfRoutes, { prefix: '/api' })
  await app.register(syncRoutes, { prefix: '' })
  await app.register(onboardingRoutes, { prefix: '/api/onboarding' })
  await app.register(superAdminRoutes, { prefix: '/api/admin' })

  // ── Health ──────────────────────────────────────────────────
  app.get(
    '/health',
    {
      schema: {
        summary: 'Service health check',
        response: {
          200: inferSuccessDataSchema('GET', '/health').dataSchema,
        },
      },
    },
    async () => {
      let dbOk: boolean | null = null
      let dbErr: any = null
      try {
        // Default ping timeout is 10s in packages/db/src/client.ts, which
        // is long enough for Neon cold-starts + TLS negotiation.
        await pingDb()
        dbOk = true
      } catch (err) {
        dbOk = false
        dbErr =
          err instanceof Error
            ? {
                message: err.message,
                code: (err as any).code,
                hostname: (err as any).hostname,
                port: (err as any).port,
              }
            : String(err)
      }
      return {
        status: dbOk ? 'ok' : 'degraded',
        version: process.env['npm_package_version'] ?? '1.0.0',
        timestamp: new Date().toISOString(),
        db: dbOk
          ? {
              ok: true,
              host: dbConnectionInfo.host,
              database: dbConnectionInfo.database,
              ssl: dbConnectionInfo.ssl,
            }
          : {
              ok: false,
              error: dbErr,
              host: dbConnectionInfo.host,
              database: dbConnectionInfo.database,
              ssl: dbConnectionInfo.ssl,
            },
      }
    }
  )

  return app
}

// Fail-fast: verify DB is reachable before we bind the listen socket.
// If DATABASE_URL is malformed, the Neon/AWS host is unreachable, or
// sslmode=require is failing, we exit with a clear error instead of
// serving "CONNECT_TIMEOUT undefined:undefined" to every request.
// Use a generous timeout — Neon cold-starts + TLS + proxy connect can
// easily take 10–20s on the first attempt.
try {
  const info = await pingDb(60000)
  console.log(
    `[db] ✔ Connected to ${info.database} on ${info.host}:${info.port} as ${info.user} (ssl=${info.ssl})`
  )
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  const hostname = (err as any)?.hostname ?? dbConnectionInfo.host
  const port = (err as any)?.port ?? dbConnectionInfo.port
  const code = (err as any)?.code
  console.error(
    `[db] ✗ Could not reach database. Bailing out before listen.\n` +
      `       Host: ${hostname}:${port} | Database: ${dbConnectionInfo.database} | SSL: ${dbConnectionInfo.ssl}${code ? ` | Code: ${code}` : ''}\n` +
      `       Error: ${msg}`
  )
  process.exit(1)
}

const server = await buildServer()
try {
  await server.listen({ port: PORT, host: HOST })
} catch (err) {
  server.log.error(err)
  process.exit(1)
}
