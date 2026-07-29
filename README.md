# StitchBook

**The complete tailoring intelligence platform.**

A full-stack, multi-tenant, offline-first SaaS for tailoring shops — covering three-layer measurement management, order and production tracking, fitting sessions, a branded client portal, fabric inventory, analytics, and a platform-level super admin console.

[![Status](https://img.shields.io/badge/status-active_development-b8860b)]()
[![Node](https://img.shields.io/badge/node-22_LTS-2d6a4f)]()
[![License](https://img.shields.io/badge/license-proprietary-6a6450)]()

---

## Table of contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start-local-development)
- [Environment variables](#environment-variables)
- [Database](#database)
- [API](#api)
- [Web dashboard](#web-dashboard)
- [Super admin console](#super-admin-console)
- [Mobile app](#mobile-app)
- [Client portal](#client-portal)
- [Background workers](#background-workers)
- [Deployment](#deployment)
- [Testing](#testing)
- [Security](#security)
- [Contributing](#contributing)
- [Project status](#project-status)

---

## Architecture

```
stitchbook/
├── apps/
│   ├── api/          — Fastify REST API (Node.js 22)
│   ├── web/           — Next.js 15 web dashboard + super admin console
│   ├── portal/         — Next.js 15 client portal (ISR)
│   ├── mobile/        — React Native + Expo Router (iOS + Android)
│   └── workers/       — BullMQ background workers (notifications, PDF)
├── packages/
│   ├── db/             — Drizzle ORM schema, relations, migrations
│   ├── types/          — Shared TypeScript types (plan features, statuses)
│   ├── utils/          — Measurement math, validation, token generation
│   ├── i18n/           — Translation files (5 shipped, more in progress)
│   ├── email/          — React Email templates
│   ├── pdf/             — Puppeteer PDF templates (measurement cards)
│   ├── ui/               — Shared web component library
│   └── ui-native/       — Shared React Native component library
├── docs/               — This documentation set
└── infra/              — Dockerfiles, Railway config
```

**Request flow for a typical action** (e.g. recording a measurement session):

```
Mobile app (offline write to WatermelonDB)
        │
        ▼  synchronize() on reconnect
apps/api/src/routes/sync              →  packages/db (Drizzle, Postgres)
        │
        ▼  app.notifications.queue()
apps/api/src/plugins/notifications.ts  →  BullMQ (Redis)
        │
        ▼  consumed by
apps/workers/src/index.ts (notifWorker) →  Twilio / Resend  +  notification_log row
                                          →  Expo push fan-out to all shop workers
```

Every mutation that changes shop-visible state also inserts a row into `notification_log`, which powers the in-app bell icon feed on both web and mobile — dispatch outcome (delivered/failed) and in-app visibility share one write path.

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 22 LTS |
| pnpm | 9.12+ |
| Docker | 24+ |
| PostgreSQL | 16 |
| Redis | 7 |

---

## Quick start (local development)

### 1. Clone and install

```bash
git clone https://github.com/your-org/stitchbook.git
cd stitchbook
pnpm install
```

### 2. Set up environment variables

Each app has its own `.env.example` — copy them all:

```bash
cp apps/api/.env.example      apps/api/.env
cp apps/web/.env.example      apps/web/.env
cp apps/workers/.env.example  apps/workers/.env
cp apps/mobile/.env.example   apps/mobile/.env
cp packages/db/.env.example   packages/db/.env
```

At minimum, fill in `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, and `COOKIE_SECRET` in `apps/api/.env`. Leave third-party keys (Twilio, Stripe, Resend, R2) empty for local dev — the app degrades gracefully and logs a warning instead of crashing when a dispatch is attempted.

### 3. Start local services with Docker

```bash
docker compose -f infra/docker-compose.dev.yml up -d
```

Starts PostgreSQL 16 and Redis 7 locally.

### 4. Generate and apply database migrations

```bash
pnpm --filter @stitchbook/db db:generate
pnpm --filter @stitchbook/db db:migrate
pnpm --filter @stitchbook/db db:seed
```

`db:generate` produces numbered SQL files from the schema in `packages/db/src/schema/` (never hand-write these). `db:seed` creates the 7 system garment templates (suit jacket, trousers, saree blouse, evening gown, agbada, abaya, child dress).

See [`packages/db/DATABASE.md`](../packages/db/DATABASE.md) for the full migration workflow.

### 5. Start all apps

```bash
pnpm dev
```

Turborepo starts everything in parallel:

| App | URL |
|---|---|
| API | http://localhost:3001 |
| Web dashboard | http://localhost:3000/dashboard |
| Super admin | http://localhost:3000/admin *(requires `role = 'super_admin'` on a worker row)* |
| Client portal | http://localhost:3002 |
| API docs (Swagger) | http://localhost:3001/docs |

For the mobile app:

```bash
cd apps/mobile
pnpm start          # Expo dev server
pnpm ios            # iOS simulator (requires Xcode)
pnpm android        # Android emulator (requires Android Studio)
```

For background workers:

```bash
pnpm --filter @stitchbook/workers start
```

---

## Environment variables

Full reference lives in each app's `.env.example`. Summary of what each app needs at minimum to boot:

| App | Required | Optional (degrades gracefully) |
|---|---|---|
| `api` | `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `WEB_URL`, `PORTAL_URL` | Stripe, Paystack, Twilio, Resend, R2 |
| `web` | `INTERNAL_API_URL`, `NEXT_PUBLIC_API_URL` | — |
| `workers` | `REDIS_HOST`, `REDIS_PORT` | Twilio, Resend, S3/R2 (jobs fail loudly if missing, by design) |
| `mobile` | `EXPO_PUBLIC_API_URL` | `EXPO_PUBLIC_PROJECT_ID` (push notifications won't register without it) |
| `db` | `DATABASE_URL` | — |

In production, `WEB_URL` and `PORTAL_URL` are **required** for the API to boot — CORS has no localhost fallback outside development (see [Security](#security)).

---

## Database

### Schema overview

Defined in `packages/db/src/schema/` using Drizzle ORM with PostgreSQL. Relational query support (`db.query.X.findMany({ with: {...} })`) is powered entirely by `packages/db/src/schema/relations.ts` — every table used in a `with:` clause anywhere in the API has a corresponding `relations()` definition there.

**Core tables:**

| Table | Description |
|---|---|
| `shops` | Top-level multi-tenant unit — plan tier, currency, default units |
| `shop_subscriptions` | Stripe subscription state |
| `portal_shop_branding` | Per-shop portal logo, accent colour, display name |
| `workers` | Tailor-side users (Better Auth-linked). Roles: `owner`, `manager`, `tailor`, `cutter`, `super_admin` |
| `clients` | Shop clients — token-authenticated, not app users |
| `client_portal_tokens` | Persistent portal access tokens per client |
| `garment_templates` | System + custom measurement field sets (L1/L2/L3 fields) |
| `measurement_sessions` | Immutable measurement records |
| `orders` | Order lifecycle — 8-stage pipeline, forward-only transitions enforced at the API layer |
| `garment_items` | Individual garments within an order — `measurementSessionId` is nullable (orders can be booked before measuring) |
| `order_payments` | Payment ledger per order |
| `fitting_sessions` | Per-fitting records with structured fit issues |
| `fabrics` / `suppliers` / `fabric_stock_movements` | Inventory tracking with restock audit trail |
| `portal_otp_tokens` | One-time tokens (worker invites, password resets, measure invites) |
| `portal_measurement_submissions` | Self-submitted client measurements pending tailor review |
| `client_notification_prefs` | Per-client channel/language preferences |
| `notification_log` | Dual-purpose: outbound dispatch audit (Twilio/Resend message IDs, delivery status) **and** the in-app worker-facing feed (`workerId`, `readAt`) |

### Running migrations

```bash
pnpm --filter @stitchbook/db db:generate   # generate SQL from schema
pnpm --filter @stitchbook/db db:migrate    # apply to database
pnpm --filter @stitchbook/db db:push       # dev-only: push without a migration file
pnpm --filter @stitchbook/db db:studio     # visual DB browser
```

---

## API

Fastify server at `apps/api/`. All business-data routes are shop-scoped — every query is filtered by the authenticated worker's `shopId`, enforced at the route level (not just by convention; see [Security](#security) for the specific IDOR fixes that hardened this).

### Authentication

Better Auth with JWT sessions. All `/api/*` routes require a valid session passed as either:
- Cookie: `better-auth.session_token`
- Header: `Authorization: Bearer <token>`

Portal routes (`/portal/*`) authenticate via per-client tokens, not worker sessions. Super admin routes (`/api/admin/*`) require an authenticated worker **and** `role === 'super_admin'`.

### Key endpoint groups

```
POST   /auth/register                      Create shop + owner account (transactional)
POST   /auth/sign-in/email                  Sign in
POST   /auth/forgot-password                Request reset token
POST   /auth/reset-password                 Consume reset token (single-use, invalidated after use)
POST   /auth/change-password                Change password (authenticated)
POST   /auth/accept-invite/:token           Accept worker invite

GET    /api/workers/me                      Current worker profile
PATCH  /api/workers/me                      Update own profile
POST   /api/workers/me/push-token           Register Expo push token (capped at 10/worker)
POST   /api/workers/invite                  Invite a worker (plan-gated)

GET    /api/clients                         List clients (search, paginate)
POST   /api/clients                         Create client + portal token
GET    /api/clients/:id                     Client detail

GET    /api/measurements/client/:id         All sessions for a client
POST   /api/measurements                    Create session (optionally atomically
                                             linked to a garment item via linkToGarmentItemId)
GET    /api/measurements/diff/:a/:b         Diff two sessions

GET    /api/orders                          List orders (filter by status/worker/search)
POST   /api/orders                          Create order + garment items
PATCH  /api/orders/:id                      Update — forward-only status transitions enforced
PATCH  /api/orders/garment-items/:itemId    Attach a measurement session post-creation
POST   /api/orders/:id/payments             Record payment (rejected on cancelled orders)
GET    /api/orders/board/kanban             Production board data

GET    /api/notifications/feed              In-app notification feed
PATCH  /api/notifications/:id/read          Mark one read
POST   /api/notifications/mark-all-read     Mark all read

GET    /api/admin/overview                  Platform-wide stats (super admin only)
GET    /api/admin/shops                     All shops, searchable
PATCH  /api/admin/shops/:id/plan            Change a shop's plan tier
PATCH  /api/admin/shops/:id/status          Suspend / reinstate a shop
GET    /api/admin/workers                   Cross-shop worker search
GET    /api/admin/flags  · PUT /flags/:key  Feature flag management (Redis-backed)

GET    /portal/:shopSlug/client/:token                       Portal home
POST   /portal/:shopSlug/measure/:inviteToken                Submit self-measurements
PATCH  /portal/submissions/:id/review                        Tailor accepts/rejects/requests clarification

GET    /api/sync/pull  · POST /api/sync/push                 WatermelonDB mobile sync
```

Full OpenAPI docs at `/docs` in development.

---

## Web dashboard

Next.js 15 App Router at `apps/web/`, organised into four route groups:

- `(marketing)` — public landing, pricing, features, about, legal pages
- `(auth)` — login, register, password reset, invite acceptance
- `(dashboard)` — the authenticated tailor-facing app, mounted at `/dashboard`
- `(admin)` — the super admin console, mounted at `/admin`

Route groups in Next.js don't add URL segments by themselves — `(dashboard)` and `(admin)` each have their own `dashboard/` and `admin/` path segment inside them so their root pages don't collide with the public `/` redirect router or with each other.

State: Zustand for auth (`stores/auth.ts`), TanStack Query for all server data. Styling: CSS custom properties defined in `globals.css` (see [Design decisions](./DESIGN_DECISIONS.md) for the full token system) plus Tailwind utilities.

---

## Super admin console

Mounted at `/admin`, gated by `apps/web/src/app/(admin)/layout.tsx` performing a server-side `role === 'super_admin'` check against `/api/workers/me` before rendering anything — there is no client-side-only gate.

| Page | Purpose |
|---|---|
| `/admin` | Platform overview — shop/worker/subscription counts, plan distribution |
| `/admin/shops` | Searchable shop list, inline plan editor, suspend/reinstate |
| `/admin/shops/:id` | Shop detail — workers, subscription, branding, order/client counts |
| `/admin/workers` | Cross-shop worker search |
| `/admin/billing` | MRR summary, paid subscription table |
| `/admin/flags` | Feature flag toggles (Redis-backed, snake_case keys enforced, live — no deploy needed) |

The `super_admin` role is never assignable through any UI — it's set directly in the database, and the worker-role update endpoint explicitly excludes it from the settable enum to prevent privilege escalation via the API.

---

## Mobile app

React Native + **Expo Router** (file-based routing — this is the one and only navigation system; do not reintroduce React Navigation primitives directly, see [Design decisions](./DESIGN_DECISIONS.md#mobile-navigation) for why this matters).

### Offline-first architecture

WatermelonDB (SQLite) is the local database. All reads come from it; writes go to WatermelonDB first and are queued for API sync. Sync runs:
- On app launch
- On network reconnect (2s debounce)
- Every 5 minutes while online
- On manual pull-to-refresh / "Sync now" tap in Settings

### Screens

```
app/
├── (auth)/login.tsx
└── (app)/
    ├── index.tsx              Dashboard (search + notification bell in header)
    ├── search.tsx             Universal search, recent searches persisted (AsyncStorage)
    ├── notifications.tsx      In-app feed
    ├── inventory.tsx          Fabric stock + inline restock
    ├── clients/
    │   ├── index.tsx, new.tsx, [id]/index.tsx, [id]/measure.tsx (Skia body diagram)
    ├── orders/
    │   ├── _layout.tsx (Stack), index.tsx (list/kanban), [id].tsx, new.tsx
    └── settings/
        ├── _layout.tsx (Stack), index.tsx, profile.tsx, shop.tsx
```

### Building for production

```bash
cd apps/mobile
eas build --platform all --profile production
eas submit --platform ios
eas submit --platform android
```

### OTA updates

```bash
eas update --branch production --message "Fix measurement validation"
```

---

## Client portal

Next.js app at `apps/portal/`, deployed with ISR.

1. Each shop has a slug (e.g. `amara-bespoke`)
2. Each client has a persistent token
3. Portal URL: `portal.stitchbook.app/amara-bespoke/client/<token>`
4. Shop branding loads at the edge (ISR, 1-hour cache); client data is always fetched fresh, never cached
5. Self-measurement invites use a separate 7-day one-time token; submissions are reviewed by the tailor (accept / request clarification on specific fields / reject) before becoming an official session

---

## Background workers

`apps/workers/src/index.ts` runs two BullMQ consumers sharing one Redis connection:

- **`notifWorker`** — dispatches WhatsApp/SMS via Twilio and email via Resend, writes the real delivery outcome to `notification_log`, and fans push notifications out to every registered device token for the shop via Expo's push API. Skips silently (with a warning log) rather than dispatching to an empty recipient.
- **`pdfWorker`** — generates measurement-card PDFs with Puppeteer, uploads to S3/R2, low concurrency (3) since Puppeteer is memory-intensive.

Both shut down gracefully on `SIGTERM`/`SIGINT`.

---

## Deployment

### API + Workers → Railway

```bash
railway up --service api
railway up --service workers
```

### Web + Portal → Vercel

Both Next.js apps deploy automatically via GitHub Actions on push to `main`.

### Required production secrets

See each app's `.env.example` for the full list. Non-negotiable for a working production boot:

```
DATABASE_URL
REDIS_URL
JWT_SECRET
COOKIE_SECRET
WEB_URL                 ← API refuses to boot in production without this (CORS safety)
PORTAL_URL               ← same
```

---

## Testing

```bash
pnpm test                                  # all packages
pnpm --filter @stitchbook/utils test       # single package
pnpm typecheck                              # type-check everything
```

Tests live alongside source as `*.test.ts`. `packages/utils/src/validation.ts` has the most thorough coverage (the measurement validation engine).

---

## Security

StitchBook has been through two dedicated hardening passes — a 15-item audit-and-fix round early in development, and a 19-item security sweep plus a syntax/type/route-collision sweep later. Full before/after detail for every fix: [`docs/BUGS_AND_SECURITY_FIXES.md`](./BUGS_AND_SECURITY_FIXES.md).

Headline guarantees currently enforced in code:
- Every business-data query is scoped to the authenticated worker's `shopId` — cross-tenant reads and writes are blocked at the route layer, not just by convention
- Order status transitions are forward-only (cancellation is the sole exception) — enforced server-side regardless of what the client sends
- Idempotency keys are namespaced per-shop in Redis — two different shops reusing the same `Idempotency-Key` header value cannot collide
- CORS has no `localhost` fallback in production; the API refuses to boot without `WEB_URL`/`PORTAL_URL` set
- Password reset tokens are single-use and hashed at rest; error messages are normalised to prevent enumeration
- The `super_admin` role cannot be granted through any API endpoint

---

## Contributing

1. Branch from `dev` — not `main`
2. Run `pnpm typecheck && pnpm lint` before pushing
3. PRs require passing CI (typecheck + lint + tests)
4. Migrations must be reviewed by a second engineer before merging
5. See [`docs/GIT_WORKFLOW.md`](./GIT_WORKFLOW.md) for the branch-naming and commit-message conventions used throughout this project's history

---

## Project status

Current state (see [`docs/CHANGELOG.md`](./CHANGELOG.md) for full milestone history):

- [x] Monorepo (Turborepo + pnpm), full Postgres schema with relations, Drizzle migrations
- [x] Fastify API — all route groups, plan gating, rate limiting, idempotency, caching, Stripe + Paystack webhooks
- [x] Web dashboard — dashboard, clients, orders (list/detail/create), inventory, analytics, settings, onboarding checklist
- [x] Client portal — all 5 screens, self-measure flow, clarification loop
- [x] Mobile app — full Expo Router screen set (orders, clients, search, notifications, inventory, settings), offline sync, push notifications
- [x] Super admin console — overview, shops, workers, billing, feature flags
- [x] Background workers — real Twilio/Resend/Puppeteer implementations, push fan-out
- [x] Security hardening — 19 fixes across auth, IDOR, injection, and validation surfaces
- [x] Bug sweep — 0 syntax errors, 0 route collisions, verified via TypeScript's own parser and AST walk across all 193 source files

**Documentation set** (this folder):
| File | Contents |
|---|---|
| `README.md` | This file |
| `PRD.md` | Product requirements — refined |
| `BRD.md` | Business requirements |
| `DESIGN_DECISIONS.md` | UI/system design decisions, edge cases, syntax |
| `CHANGELOG.md` | Full milestone-by-milestone changelog |
| `BUGS_AND_SECURITY_FIXES.md` | Before/after code for every fix, across all milestones |
| `GIT_WORKFLOW.md` | Reconstructed branch/commit history — 55 branches |

---

*StitchBook · Built for tailors everywhere.*
#   s t i t c h b o o k  
 #   s t i t c h b o o k  
 