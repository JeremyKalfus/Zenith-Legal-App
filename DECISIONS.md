# Decision Log

## Template

```
### [YYYY-MM-DD] Decision Title

**Decision:** What was decided.

**Options considered:**
1. Option A -- tradeoffs
2. Option B -- tradeoffs

**Rationale:** Why this option was chosen.

**Consequences:** What this means going forward.
```

## Recorded Decisions

### [2026-02-21] npm workspaces monorepo

**Decision:** Use npm workspaces (no Turborepo/Nx) to manage `apps/mobile`, `apps/admin`, and `packages/shared`.

**Options considered:**
1. npm workspaces -- zero extra tooling, native npm support
2. Turborepo -- caching and parallel task orchestration
3. Nx -- full-featured monorepo with dependency graph

**Rationale:** Minimal complexity for a small team. Three workspaces do not require build caching or dependency-graph tooling. npm workspaces are sufficient and add no dependencies.

**Consequences:** No built-in task caching. CI runs all checks sequentially. Can migrate to Turborepo later if build times grow.

### [2026-02-21] Expo + React Native for mobile

**Decision:** Use Expo SDK 54 with React Native 0.81 for the mobile app.

**Options considered:**
1. Expo managed workflow -- simplified build/deploy, OTA updates
2. Bare React Native -- full native control
3. Flutter -- cross-platform alternative

**Rationale:** Expo provides the fastest path to iOS + Android + web from a single codebase. The managed workflow handles build signing and OTA updates. Web support enables browser-based testing during development.

**Consequences:** Locked to Expo's SDK release cycle. Some native modules require custom dev client builds. Web output is secondary to native.

### [2026-02-21] Supabase as backend

**Decision:** Use Supabase (Auth, Postgres, Edge Functions, Realtime) as the sole backend.

**Options considered:**
1. Supabase -- integrated auth/db/functions/realtime
2. Custom Node.js API + managed Postgres -- full control
3. Firebase -- Google ecosystem

**Rationale:** Supabase provides auth, database, serverless functions, and realtime subscriptions in a single platform. Row Level Security eliminates the need for a separate authorization layer. Edge functions (Deno) handle business logic that RLS alone cannot express.

**Consequences:** Vendor lock-in to Supabase. Edge functions use Deno (not Node.js). Database migrations managed via Supabase CLI.

### [2026-02-21] Stream Chat for messaging

**Decision:** Use Stream Chat SDK for real-time messaging between candidates and staff.

**Options considered:**
1. Stream Chat -- managed chat infrastructure with SDKs
2. Supabase Realtime + custom UI -- lower cost, more work
3. SendBird -- alternative managed chat

**Rationale:** Stream provides a production-ready chat SDK with React Native components, offline support, and webhook integration. Building chat on Supabase Realtime would require significant custom work for typing indicators, read receipts, and message delivery guarantees.

**Consequences:** Additional vendor dependency and cost. Requires Stream API key/secret management. Webhook endpoint needed for server-side events.

### [2026-02-21] Zod for validation

**Decision:** Use Zod for schema validation across client and server.

**Options considered:**
1. Zod -- TypeScript-first, composable schemas
2. Yup -- mature, widely used
3. io-ts -- FP-oriented, type-safe

**Rationale:** Zod v4 provides TypeScript type inference from schemas, eliminating type/validation drift. Shared schemas in `packages/shared` are used by both the mobile app (form validation) and edge functions (request validation).

**Consequences:** Zod v4 is used in edge functions via `npm:zod@4.3.6` (Deno npm specifier). Must keep versions compatible across client and server.

### [2026-02-23] verify_jwt = false for all edge functions

**Decision:** Disable Supabase gateway JWT verification for all edge functions and validate auth internally.

**Options considered:**
1. Gateway verification (verify_jwt = true) -- automatic, zero code
2. Internal verification (verify_jwt = false + getUser(token)) -- manual, full control

**Rationale:** The project's JWT signing key format is incompatible with the Supabase gateway's built-in JWT verification, causing "Invalid JWT" errors at the gateway before functions execute. Internal verification via `getCurrentUserId()` (which extracts the Bearer token and passes it to `getUser(token)`) provides equivalent security.

**Consequences:** Every authenticated edge function must call `getCurrentUserId()` or `assertStaff()`. Public functions (`register_candidate_password`, `mobile_sign_in_with_identifier_password`) skip auth validation entirely. The `verify_jwt = false` setting must be maintained in `supabase/config.toml` for all functions.

### [2026-02-23] ensureValidSession client helper

**Decision:** Add a client-side `ensureValidSession()` helper that proactively refreshes tokens nearing expiry before making authenticated requests.

**Options considered:**
1. Rely solely on Supabase auto-refresh timer -- simple, but timer can miss when tabs are backgrounded
2. Proactive refresh before each request -- slightly more network calls, but guarantees fresh tokens

**Rationale:** The Supabase JS client's `autoRefreshToken` uses a background timer that can fail when browser tabs are backgrounded or mobile apps are suspended. Checking `expires_at` and refreshing within a 60-second window before each authenticated call eliminates stale-token errors.

**Consequences:** Adds a small latency overhead per authenticated call (local session check). Refresh only happens when the token is within 60 seconds of expiry.

## Pending Decisions

- **Notification delivery providers** -- Which push notification service (Expo Push, FCM, APNs) and email provider (Resend, SendGrid) to use for `dispatch_notifications`.
- **Calendar OAuth providers** -- Implementation details for Google and Microsoft calendar sync in `connect_calendar_provider`.
- **Staging environment setup** -- Dedicated Supabase project and Vercel preview deployment configuration.
- **Mobile release strategy** -- EAS build profiles, TestFlight/Play Store internal testing channels, OTA update policy.
