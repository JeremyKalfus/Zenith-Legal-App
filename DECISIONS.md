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

### [2026-02-24] Mobile auth clears invalid persisted refresh tokens on startup

**Decision:** When Supabase auth session recovery returns an invalid refresh-token error (`Invalid Refresh Token`, `Refresh Token Not Found`), the mobile app clears the persisted local auth session and returns the user to sign-in instead of continuing retry/error loops.

**Options considered:**
1. Surface the raw Supabase error and require manual reinstall/sign-out -- low code change, poor UX and recurring LogBox errors
2. Detect invalid refresh-token errors and perform local sign-out/session clear (chosen)
3. Always clear persisted auth state on any `getSession()` error -- simpler, but too destructive for transient network errors

**Rationale:** Account deletion and token revocation are legitimate flows that leave stale refresh tokens on device storage. Supabase attempts recovery on startup and can log console errors repeatedly until the stale token is removed. Targeted detection preserves good sessions while fixing the bad-token loop.

**Consequences:** Mobile auth bootstrap and `ensureValidSession()` now clear local persisted auth state for invalid refresh-token failures and fail open to the sign-in screen. Other auth/network errors still surface normally.

### [2026-02-24] Push-first notification dispatch in `dispatch_notifications`

**Decision:** Implement queued push notification processing in `dispatch_notifications` via Expo Push API first, while preserving the existing event-enqueue behavior and deferring email provider delivery integration.

**Options considered:**
1. Implement both push + email providers in one pass -- complete but blocked on choosing/configuring an email vendor
2. Implement push queue processing first and keep email rows queued until provider integration (chosen)
3. Replace the existing enqueue function with a processor-only function -- simpler internals but breaks compatibility with the current payload shape

**Rationale:** Push notifications can ship immediately using Expo Push API without new vendor secrets, which unblocks end-to-end notification delivery for mobile users. Keeping `dispatch_notifications` dual-mode avoids breaking internal callers while email delivery is completed later.

**Consequences:** `dispatch_notifications` supports processor mode (default) for queued push deliveries and enqueue mode for `{ events: [...] }` payloads. Email deliveries remain queued until provider integration is added.

### [2026-02-25] Mobile production application identifiers

**Decision:** Set the production iOS bundle identifier and Android package name to `com.zenithlegal.app`.

**Options considered:**
1. `com.zenithlegal.app` -- concise, brand-aligned, works across iOS/Android
2. `com.zenithlegal.mobile` -- clear mobile suffix, but less concise
3. Environment-specific production identifiers -- unnecessary complexity for the primary production app identity

**Rationale:** The domain `zenithlegal.com` supports the reverse-DNS prefix `com.zenithlegal`. Using `app` as the final segment keeps the identifier short and stable for long-term store listings.

**Consequences:** Store releases should keep `ios.bundleIdentifier` and `android.package` fixed at `com.zenithlegal.app`. Non-production builds should use separate identifiers (for example a `.staging` suffix) if side-by-side installs are needed.

### [2026-02-25] EAS-managed credentials and remote app version source for store builds

**Decision:** Use Expo EAS-managed signing credentials for Android/iOS store builds and set `apps/mobile/eas.json` to `cli.appVersionSource = "remote"` with production `autoIncrement`.

**Options considered:**
1. EAS-managed credentials + remote version source -- fastest release setup; centralizes signing and version increments in EAS
2. EAS-managed credentials + local version source -- keeps version increments in repo, but creates local file churn on each build
3. Manual credentials + local version source -- maximum control, highest operational overhead and risk of misconfiguration

**Rationale:** The app is Expo-managed and the immediate goal is to ship TestFlight / Play internal builds quickly. EAS-managed credentials remove manual certificate/keystore handling, and the remote version source avoids repeated local edits to `ios.buildNumber` / `android.versionCode` when `autoIncrement` is enabled.

**Consequences:** EAS now injects remote build numbers/version codes during production builds; local `ios.buildNumber` and `android.versionCode` remain manifest values but are not the authoritative increment source during EAS builds. EAS build configuration also stores `promptToConfigurePushNotifications = false` after deferring APNs setup during the first build flow. APNs and App Store Connect submit credentials were later configured in EAS on the same day; Google Play submit credentials remain follow-up work.

### [2026-02-25] Pin `submit.production.ios.ascAppId` in `eas.json`

**Decision:** Add `submit.production.ios.ascAppId` (`6759677619`) to `apps/mobile/eas.json` and use that for iOS submissions instead of relying on EAS App Store Connect app auto-discovery.

**Options considered:**
1. Set `ascAppId` explicitly in `eas.json` -- deterministic, avoids auto-lookup failures
2. Rely on EAS App Store Connect app lookup each submit -- less config, but failed in this project with a CLI/runtime error
3. Bypass EAS submit and upload IPA manually with Transporter -- viable fallback, but adds manual release steps

**Rationale:** `eas submit -p ios --profile production --latest` failed during the "ensure app exists on App Store Connect" step with `Cannot read properties of undefined (reading 'attributes')`. Adding `ascAppId` skips that lookup path and allows submission scheduling with the already-configured EAS-managed App Store Connect API key.

**Consequences:** iOS EAS submit for the `production` profile depends on the configured App Store Connect app ID in repo config. If the App Store Connect app record is recreated under a different Apple app ID, `apps/mobile/eas.json` must be updated.

### [2026-02-25] Manual Transporter upload fallback when EAS submit scheduling does not deliver to Apple

**Decision:** Use Apple Transporter as the fallback upload path when EAS Submit schedules an iOS submission but the build does not appear in App Store Connect within a reasonable window, and verify Apple receipt directly before waiting longer.

**Options considered:**
1. Keep waiting after EAS says "Scheduled iOS submission" -- low effort, but ambiguous and can waste review/testing time
2. Retry EAS submit and then verify App Store Connect receipt quickly -- good first step but still subject to EAS submit transport issues
3. Upload the generated IPA manually via Transporter (chosen fallback) -- reliable Apple-native upload path, manual step

**Rationale:** In this release setup, EAS submit jobs were scheduled successfully, but Apple App Store Connect showed no received builds for the app. Manual Transporter upload of the same IPA delivered immediately and unblocked TestFlight processing.

**Consequences:** "Submission scheduled" on EAS is not treated as completion. Release ops should verify the build appears in App Store Connect/TestFlight (or via App Store Connect API) before waiting on processing. Transporter is the preferred fallback when EAS submit transport is unreliable.

### [2026-02-25] EAS production `EXPO_PUBLIC_*` vars are required for store builds

**Decision:** Treat EAS production environment variables (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_STREAM_API_KEY`, etc.) as mandatory release configuration for TestFlight/App Store builds and validate runtime sign-in before inviting testers.

**Options considered:**
1. Rely on local `.env` during development and assume release builds will be configured later -- fast initial setup, but easy to miss and ships placeholder config
2. Configure EAS production vars before first store build (preferred process)
3. Ship a first TestFlight build without EAS vars and use it only to validate signing/upload pipeline (what happened)

**Rationale:** The first TestFlight build (`1.0.0 (2)`) installed successfully but failed sign-in with `Supabase config is still using placeholder values.` because EAS production env vars were not configured. Expo/EAS builds do not automatically use local `.env` values.

**Consequences:** A new iOS build is required after configuring EAS production env vars; the current `1.0.0 (2)` build remains useful only for verifying signing/upload/TestFlight plumbing. Release checklists and plans now explicitly track EAS production runtime env var configuration.

## Pending Decisions

- **Notification delivery providers** -- Which push notification service (Expo Push, FCM, APNs) and email provider (Resend, SendGrid) to use for `dispatch_notifications`.
- **Calendar OAuth providers** -- Implementation details for Google and Microsoft calendar sync in `connect_calendar_provider`.
- **Staging environment setup** -- Dedicated Supabase project and Vercel preview deployment configuration.
- **Mobile release strategy** -- TestFlight/Play Store rollout cadence, Google Play submit credential ownership, OTA update policy.
