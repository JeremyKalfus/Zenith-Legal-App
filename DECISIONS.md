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

### [2026-02-24] No users_profile fallback in chat_auth_bootstrap

**Decision:** Do not auto-create a `users_profile` row inside `chat_auth_bootstrap` when one is missing. Return 404 "User profile not found" instead.

**Options considered:**
1. Fallback: create a minimal profile from `auth.admin.getUserById()` inside the chat function when missing.
2. No fallback: require profile to exist; fix root cause (profile must be created via register or intake).

**Rationale:** Fallback hides the real issue (user reached Messages without a profile). The app only shows candidate tabs when `profile` is loaded, so in normal flow the profile exists. If 404 appears, the fix is to ensure the correct auth/session is sent or the profile was created via the proper registration/intake path, not to paper over it in the chat function.

**Consequences:** Chat requires an existing `users_profile` row. Clients must call `ensureValidSession()` before bootstrap; errors are surfaced via `getFunctionErrorMessage()` so users see the actual backend message (e.g. "User profile not found") instead of a generic non-2xx message.

### [2026-02-24] Edge function error message extraction from response body

**Decision:** Use `getFunctionErrorMessage()` to read the error message from the edge function response body (`FunctionsHttpError.context`), using `Response.clone()` when available so the body is not consumed.

**Options considered:**
1. Show only `error.message` from the Supabase client (generic "Edge Function returned a non-2xx status code").
2. Parse `error.context` (the Response) and extract `{ error: "..." }` from the body; use clone() so multiple reads work.

**Rationale:** Users need to see the actual reason the function failed (e.g. "User profile not found", "Unauthorized: missing Authorization header"). The Supabase JS client puts the Response on `error.context`; reading it once (or from a clone) and returning `payload.error` gives actionable feedback.

**Consequences:** All invoke call sites that show errors to users should use `getFunctionErrorMessage(error, fallback)`. Do not throw a new `Error(message)` after extraction when the original error has `context`, so the same error object is not replaced and body extraction remains possible.

### [2026-02-24] Dual-mode `chat_auth_bootstrap` for staff inbox vs thread bootstrap

**Decision:** Allow staff callers to invoke `chat_auth_bootstrap` without `user_id` to receive only a Stream token/user payload (for inbox channel listing). Keep channel provisioning behavior when a candidate `user_id` is provided.

**Options considered:**
1. Require `user_id` for all staff calls -- simple contract, but blocks inbox-first staff messaging UX
2. Add dual-mode behavior (token-only without `user_id`, channel bootstrap with `user_id`) -- slightly more branching, supports inbox + thread flows
3. Create a second edge function just for staff inbox token bootstrap -- clearer separation, more surface area to maintain

**Rationale:** Staff messaging now uses an inbox-first flow. Staff need to connect to Stream and query existing candidate channels before selecting a thread. Dual-mode behavior preserves the existing candidate path and avoids introducing a second function with duplicate auth and Stream token logic.

**Consequences:** `chat_auth_bootstrap` responses are conditional: `channel_id` is omitted for staff token-only bootstrap. Client code must treat `channel_id` as optional and only require it when opening a specific thread.

### [2026-02-24] Candidate waiting-status decline deletes assignment; admin user deletion is candidate-only

**Decision:** A candidate declining a firm while the assignment is in `Waiting on your authorization to contact/submit` deletes the assignment row instead of keeping a declined placeholder. Admin web user deletion is limited to candidate accounts (hard delete via Supabase auth admin API).

**Options considered:**
1. Keep declined waiting assignments and add a new declined status -- preserves history but requires schema/UI expansion
2. Hide declined waiting assignments only on candidate dashboard -- preserves data but adds hidden/archive semantics
3. Delete waiting assignments on decline; keep authorized-state decline as cancel -- simplest UX and no schema change (chosen)

**Rationale:** The requested UX is "decline should delete it from the user's list" for waiting assignments. Deleting the assignment directly satisfies this without introducing new status values or hidden-state logic. Limiting admin deletion to candidates matches the requested scope and reduces risk around staff account administration.

**Consequences:** `authorize_firm_submission` now branches `declined` behavior by current assignment status. Admin web user deletion uses a dedicated staff-only edge function and rejects staff/self deletion in this workflow.

### [2026-02-24] Candidate self-service in-app account deletion for store compliance

**Decision:** Add a candidate self-service account deletion action in the mobile Profile screen that directly deletes the authenticated account (hard delete), rather than only creating a support request.

**Options considered:**
1. Support-request-only deletion (email/contact staff) -- lower engineering work, but weaker app-store compliance for in-app deletion expectations
2. In-app self-service hard delete via authenticated edge function -- stronger user control and aligns with Apple/Google in-app deletion expectations (chosen)
3. Soft-delete/deactivate account -- reversible, but requires schema + product lifecycle changes

**Rationale:** App stores increasingly expect account deletion to be initiated in-app, not routed exclusively through support. A direct authenticated edge function keeps the workflow simple while preserving necessary historical references by nulling non-cascading foreign keys before deleting the auth user.

**Consequences:** `delete_my_account` edge function exists and is deployed. Candidate Profile UI now includes a typed confirmation + destructive action. Some historical records may remain with identifiers removed/nullified where required for integrity/compliance.

## Pending Decisions

- **Notification delivery providers** -- Which push notification service (Expo Push, FCM, APNs) and email provider (Resend, SendGrid) to use for `dispatch_notifications`.
- **Calendar OAuth providers** -- Implementation details for Google and Microsoft calendar sync in `connect_calendar_provider`.
- **Staging environment setup** -- Dedicated Supabase project and Vercel preview deployment configuration.
- **Mobile release strategy** -- EAS build profiles, TestFlight/Play Store internal testing channels, OTA update policy.
