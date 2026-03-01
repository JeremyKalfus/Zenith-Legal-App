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

### [2026-02-26] Consolidate staff-messaging into shared package

**Decision:** Move `staff-messaging.ts` (types, channel parsing, inbox mapping, timestamp formatting) from duplicate implementations in `apps/admin/src/features/` and `apps/mobile/src/features/` into `packages/shared/src/staff-messaging.ts`.

**Options considered:**
1. Keep duplicates in each app -- zero migration risk, but 100% code duplication
2. Consolidate into `@zenith/shared` (chosen) -- single source of truth, both apps import from shared

**Rationale:** The files were byte-for-byte identical across admin and mobile. Consolidation eliminates drift risk and reduces maintenance surface.

**Consequences:** Both admin and mobile now import `StaffMessageInboxItem`, `mapChannelsToStaffInboxItems`, `formatRelativeTimestamp`, and `parseCandidateUserIdFromChannelId` from `@zenith/shared`. Tests moved to `packages/shared/src/staff-messaging.test.ts`.

### [2026-02-26] Centralize mobile UI colors in theme object

**Decision:** Define all mobile UI colors as semantic tokens in `apps/mobile/src/theme/colors.ts` (`uiColors` object) and replace inline hex values across screens.

**Options considered:**
1. Continue with inline hex colors -- simple, but creates hardcoded-color code smells and inconsistency risk
2. Centralize into a `uiColors` theme object (chosen) -- single palette definition, semantic naming, easy to theme later

**Rationale:** desloppify flagged 20+ hardcoded color instances across mobile screens. Centralizing into named tokens improves consistency and makes future theming (e.g. dark mode) straightforward.

**Consequences:** All mobile screen stylesheets reference `uiColors.*` instead of hex strings. New colors should be added to `uiColors` rather than hardcoded.

### [2026-02-26] Extract custom hooks from large React components

**Decision:** Refactor large React components (200+ lines) by extracting state, effects, and handlers into co-located `useXxx` hooks, leaving components as pure JSX.

**Options considered:**
1. Leave components as-is -- no refactoring risk, but desloppify flags them as monster functions
2. Split into multiple sub-components only -- reduces JSX size but scatters state management
3. Extract hooks + sub-components (chosen) -- clean separation of business logic and render logic

**Rationale:** desloppify flagged 7 functions exceeding the complexity threshold. Hook extraction is the standard React pattern for separating concerns without over-engineering into multiple files.

**Consequences:** 6 components now use this pattern. The hooks themselves may still be flagged as large, but further splitting into hooks-of-hooks would be over-engineering for the current codebase size.

### [2026-02-26] Refactor dispatch_notifications into focused helper functions

**Decision:** Extract `processQueuedPushDeliveries` (153 lines) into focused helpers: `fetchTokensByUser`, `processSingleDelivery`, `revokeStaleTokens`, `claimQueuedPushDelivery`, `markDeliveryStatus`.

**Options considered:**
1. Keep monolithic function -- simple, but hard to test and reason about
2. Extract into focused helpers in the same file (chosen) -- each function has a single responsibility

**Rationale:** The function handled token fetching, delivery claiming, push sending, ticket processing, token revocation, and status updates in one block. Extracting helpers improves readability and makes each operation independently testable.

**Consequences:** Main `processQueuedPushDeliveries` reduced to ~65 lines of orchestration. Helper functions are internal to the edge function file.

## Pending Decisions

- **Notification delivery providers** -- Which push notification service (Expo Push, FCM, APNs) and email provider (Resend, SendGrid) to use for `dispatch_notifications`.
- **Microsoft calendar provider support** -- `calendar_provider` still includes `microsoft`, but user-facing setup and sync behavior are currently implemented for Google + Apple only.
- **Staging environment setup** -- Dedicated Supabase project and Vercel preview deployment configuration.
- **Mobile release strategy** -- TestFlight/Play Store rollout cadence, Google Play submit credential ownership, OTA update policy.

### [2026-02-27] Use `scheduled` as canonical reviewed appointment status

**Decision:** Treat `scheduled` as the canonical state for approved appointments and stop writing `accepted` as an active runtime status.

**Options considered:**
1. Keep `accepted` as canonical -- no migration work, but mismatched product language and duplicated semantics with `scheduled`
2. Rename at UI layer only -- lower-risk display fix, but inconsistent backend data semantics
3. Canonicalize to `scheduled` end-to-end (chosen) -- requires migration + logic updates, but removes semantic drift

**Rationale:** Product language uses “scheduled,” and status-dependent logic (conflict checks, visibility windows, notifications) should key off a single canonical value.

**Consequences:** Existing `accepted` rows are migrated to `scheduled`; overlap constraints now target `scheduled`; functions still accept legacy `accepted` input for backward compatibility but normalize writes to `scheduled`.

### [2026-02-27] Delayed reminder queue and per-user calendar sync links

**Decision:** Add delayed notification dispatch (`notification_deliveries.send_after_utc`) for 15-minute appointment reminders and persist calendar sync records per appointment+provider+user (`calendar_event_links`).

**Options considered:**
1. Fire reminders immediately and rely on client-local timers -- simple server logic, unreliable delivery
2. Add delayed queue field + due-time processor filtering (chosen) -- predictable server-side reminder timing
3. Add full external scheduler service first -- robust, but unnecessary complexity for current architecture

**Rationale:** The existing notification queue can support reminder timing with a minimal schema change and no new service. Calendar links need to be user-specific (candidate and staff participants) to avoid collisions and support parallel provider connections.

**Consequences:** Dispatch processor now sends only due push rows (`send_after_utc <= now`). Appointment writes/reviews enqueue reminder events. Calendar sync records are keyed by appointment/provider/user and currently support Google API sync plus Apple ICS-link representation.

### [2026-02-27] Mobile self-service calendar connection in Profile screens

**Decision:** Implement user-facing calendar setup in mobile Profile screens via a shared `CalendarSyncCard` for both candidate and staff users.

**Options considered:**
1. Keep calendar setup backend-only and rely on manual DB/function calls -- no UI work, but unusable for end users
2. Add setup only for candidates -- partial rollout, staff still blocked from self-service setup
3. Add shared setup UI for both roles (chosen) -- consistent UX and immediate self-service for all appointment participants

**Rationale:** Calendar sync is participant-specific (candidate + staff), so both roles need a first-class setup path. Profile is the natural location for account-level external integrations.

**Consequences:** Mobile profile now exposes provider status + connect actions. Google uses OAuth code flow with PKCE and in-app token exchange (`expo-auth-session`), then stores tokens through `connect_calendar_provider`. Apple uses one-tap connect for ICS sync mode. Calendar token parsing in sync code now supports nested `oauth_tokens` payload shape from connection rows.

### [2026-02-27] Use device-native calendar sync in Expo appointment screens

**Decision:** Add mobile-side device calendar sync (`expo-calendar`) so candidate/staff scheduled appointments are created/updated directly in the device calendar app, with declined/cancelled records removed.

**Options considered:**
1. Keep backend-only provider link state -- low implementation effort, but no visible on-device calendar events in Expo
2. Build provider-specific deep links only -- partial experience and no event lifecycle updates
3. Sync directly to device calendar from appointment screens (chosen) -- immediate user-visible behavior in Expo across iOS/Android

**Rationale:** Users in Expo need concrete event creation in native calendar apps, not only backend provider records. Device sync closes that gap immediately while retaining existing provider connection state.

**Consequences:** Appointment screen data now triggers `expo-calendar` upsert/delete behavior when a connected provider exists. Calendar access permission is requested in-app, and app config now includes the `expo-calendar` plugin permission text.

### [2026-02-27] Per-candidate recruiter banner contact overrides with global fallback

**Decision:** Add a dedicated table (`candidate_recruiter_contact_overrides`) and staff mobile controls to set/reset banner phone/email per candidate, with runtime precedence `candidate override -> global recruiter_contact_config -> env default`.

**Options considered:**
1. Keep global-only banner contact -- low complexity, but cannot support candidate-specific routing/preferences
2. Add per-candidate overrides with explicit reset to default (chosen) -- slightly more schema/UI work, but fulfills targeted banner behavior cleanly
3. Add full campaign/rules engine (priority/expiration/targeting) -- flexible, but unnecessary scope for current product need

**Rationale:** Product requirement is candidate-specific banner contact edits by staff in the Candidates flow while preserving a safe global fallback path.

**Consequences:** Candidates can now see personalized banner contact details where candidate context exists; staff can save or remove overrides in the mobile candidate management flow without affecting other candidates.

### [2026-02-27] Semantic status badges for firm assignment listings

**Decision:** Standardize firm-assignment status rendering with semantic badge colors across candidate mobile, staff mobile, and admin listing surfaces.

**Options considered:**
1. Leave status text unstyled -- minimal effort, poor scanability
2. Color only positive/negative outcomes -- partial visual signal, weak pipeline clarity
3. Apply semantic color mapping to all statuses (chosen) -- strongest readability and consistency across surfaces

**Rationale:** Recruiters and candidates both need to quickly parse pipeline stage at a glance; consistent colors reduce cognitive load and status ambiguity.

**Consequences:** All listing surfaces now share one palette (Waiting=amber, Authorized=teal, Submitted=blue, Interview=violet, Rejected=red, Offer=green), implemented via dedicated mobile/admin helper mappings.

### [2026-02-28] Email-first signup with routed signup-completion intake

**Decision:** Change candidate signup to a two-step flow: email-only precheck in Auth Menu (`check_candidate_signup_email`), then route to `signupCompletion` intake with locked email plus password/confirm-password before account creation.

**Options considered:**
1. Keep account creation on auth menu (email+password) then collect profile later -- fewer screens, but less control over duplicate-email UX and screenshot mismatch.
2. Email precheck then routed signup-completion intake (chosen) -- one extra step, but deterministic routing and clearer account-exists handling.
3. Route directly to full intake without precheck and fail at submit -- simplest backend, but weaker UX on existing-email collisions.

**Rationale:** The requested UX requires Sign Up to be email-first and to route users into a finish-profile style screen with locked email and credentials collected there. Precheck enables immediate “account exists” handling and tab-switch to login before full form entry.

**Consequences:** Added public edge function `check_candidate_signup_email` and new unauthenticated route `SignupFinishProfile`. Auth menu now hides password on Sign Up. Intake screen gained `signupCompletion` mode with locked email, password fields, and privacy-only consent UI.

### [2026-02-28] JD date filtering depends on migration parity + shared JD-year filter semantics

**Decision:** Treat `users_profile.jd_degree_date` as required schema for staff candidate-management surfaces and implement JD filtering as year-based chips in shared filter logic (`search AND (city OR practice OR JD year)`).

**Options considered:**
1. Keep `jd_degree_date` optional in app queries with no filter support -- avoids migration dependency but does not satisfy JD filter requirements.
2. Add UI-only filters without schema enforcement -- brittle and fails when remote schema is behind.
3. Apply migration parity first and add shared JD-year filter path across admin + mobile (chosen).

**Rationale:** The runtime error came from schema drift: app code selected `jd_degree_date` while the linked remote DB was missing migration `20260228161000`. Applying migration first removes the root cause; implementing JD year filtering in shared logic keeps admin/mobile behavior consistent.

**Consequences:** `supabase db push` for `20260228161000_candidate_jd_degree_date.sql` is now a required environment step. Staff candidate flows on admin and mobile now include JD-year filters built from `jd_degree_date`.

### [2026-02-28] Appointment review scheduling posts chat update but does not fail closed

**Decision:** When staff schedules a pending appointment via `staff_review_appointment`, post a candidate-channel chat message, but do not fail the appointment scheduling transaction if chat posting fails.

**Options considered:**
1. Fail closed on chat post errors -- guarantees chat side-effect, but blocks scheduling on external chat/transient issues.
2. Skip chat posting on review path -- avoids coupling, but misses required user-facing text updates.
3. Attempt chat post and fail open with structured logging on error (chosen).

**Rationale:** Scheduling is the primary operation; chat updates are important but secondary. Failing open preserves core workflow reliability while still surfacing operational issues through logs.

**Consequences:** `staff_review_appointment` now sends an in-app text update for scheduled decisions and logs `appointment_review_channel_message_failed` errors without returning non-2xx for notification-only failures.

### [2026-02-28] Candidate-to-staff promotion via dedicated staff edge function

**Decision:** Add a dedicated staff-only edge function `staff_update_user_role` for admin role promotion (`candidate -> staff`) instead of direct client table updates.

**Options considered:**
1. Direct client-side `users_profile.role` update under RLS -- works with staff policies but lacks centralized validation/audit semantics.
2. Reuse existing delete/assignment functions for role mutation -- wrong abstraction and mixed responsibilities.
3. Add dedicated audited function for role changes (chosen).

**Rationale:** Role mutation is a privileged operation and should be validated, audited, and error-coded server-side.

**Consequences:** Admin candidate manager now exposes a Promote to Staff action backed by `staff_update_user_role`; all role promotions from this workflow are audited via `audit_events`.

### [2026-03-01] Sectioned appointment lifecycle with hard-delete request cleanup + cancellable upcoming schedule

**Decision:** Standardize appointment UIs around section buckets and route destructive actions through a dedicated lifecycle endpoint:
- Candidate sections: `Overdue Confirmed`, `Outgoing Requests`, `Upcoming Appointments`
- Staff/admin sections: `Overdue Confirmed`, `Incoming Requests`, `Upcoming Appointments`
- `ignore_overdue` and `cancel_outgoing_request` hard-delete appointment rows
- `cancel_upcoming` sets status to `cancelled` (not delete)

**Options considered:**
1. Keep one mixed appointment list and rely on status badges -- lower implementation cost, but does not satisfy workflow clarity and action semantics.
2. Soft-hide outgoing/overdue rows with extra status/flag columns -- preserves rows, but adds filtering complexity and “ghost” lifecycle semantics.
3. Add explicit lifecycle actions with mixed delete/cancel strategy (chosen) -- highest UX clarity with minimal schema changes and explicit side-effects.

**Rationale:** Product requires explicit sections and action-specific behavior: some records should disappear permanently from both sides (outgoing cancel/overdue ignore), while upcoming cancellation must remain auditable and messageable.

**Consequences:** Added `manage_appointment_lifecycle` edge function, shared appointment section bucketing helpers in `@zenith/shared`, and sectioned render paths in candidate mobile, staff mobile, and admin web. Cancellation and staff modification flows now emit candidate-channel chat updates with appointment summaries; cancellation also queues `appointment.cancelled` notifications.

### [2026-03-01] Adopt start-only appointment input format with hard-delete cancellation semantics

**Decision:** Use a start-only appointment input model (Date + Time + modality + optional video/location + optional note) across candidate mobile, staff mobile, and admin web. Keep `end_at_utc` internally with a fixed 30-minute duration and hard-delete upcoming cancellations.

**Options considered:**
1. Keep title/description + explicit start/end editor -- compatible with legacy payloads, but conflicts with required simplified UX.
2. Start-only input with computed internal end-time and hard-delete cancellation (chosen) -- aligns UX while preserving overlap checks/calendar sync compatibility.
3. Add full start/end editors to all surfaces and only relabel fields -- least backend change, but does not satisfy requested format and card presentation.

**Rationale:** Product requires a simplified appointment model with consistent section behavior and deterministic sync across candidate/admin surfaces, including immediate removal on ignore/decline/cancel actions.

**Consequences:** Appointment cards now render candidate/date/time overview with 2-line note preview + inline expand/collapse. `manage_appointment_lifecycle` now treats overdue and upcoming actions as hard deletes and uses start-time boundaries for overdue/upcoming checks. Chat payloads were standardized to field-based templates (`Candidate/Date/Time/Meeting type/Video|Location/Note`) for schedule, decline, cancel, and modify events.

### [2026-03-01] Recruiter-owned candidate assignment + dedicated recruiter mobile filter screen

**Decision:** Add recruiter ownership assignments via `candidate_recruiter_assignments` and replace recruiter mobile candidate chip filters with a dedicated `Filter Search` screen (separate route) that applies structured filters back on the list.

**Options considered:**
1. Keep existing inline chips and add recruiter/status filters as more chips -- fastest change, but poor scalability and weak parity with requested UX.
2. Open an inline modal on the same list screen -- workable, but less clear navigation and weaker “apply then return” flow.
3. Add separate filter screen + persisted recruiter assignment table (chosen) -- most explicit UX and durable data model for recruiter ownership.

**Rationale:** Product requirement explicitly calls for a `Filter Search` button flow with `Clear`/`Apply` and separate navigation semantics, plus an assignable recruiter field with `None` support. A dedicated table keeps recruiter ownership explicit and auditable.

**Consequences:** Recruiter mobile candidates now use `search AND` structured filters (assigned recruiter/current status/practice + OR sets for firms/cities/JD years), candidate detail supports saveable Assigned Recruiter selection (`None` or specific recruiter), and recruiter root tabs render a shared top-right Zenith logo title component.

### [2026-03-01] Appointment chat intro text is action-specific (submit vs accept vs direct schedule)

**Decision:** Keep a shared appointment-field formatter, but enforce distinct intro text per lifecycle action rather than reusing `Appointment scheduled.` across all paths.

**Options considered:**
1. Use one generic intro for all schedule-related actions -- simpler copy maintenance, but ambiguous user meaning.
2. Action-specific intros with shared field formatter (chosen) -- clearer lifecycle communication while preserving one formatting contract.
3. Full per-surface custom messages -- most flexibility, but highest drift risk across mobile/admin.

**Rationale:** Users and staff need explicit distinction between request submission, request acceptance, and direct scheduling. Reusing a generic intro made pending-request and accepted-request events look identical.

**Consequences:** Message intros are now:
- Candidate submit request: `Appointment request sent and waiting for admin approval.`
- Admin accepts incoming request: `Appointment request accepted and scheduled.`
- Admin direct schedule create: `Appointment scheduled.`
- Admin/candidate upcoming cancel: `Scheduled appointment canceled.`
- Admin incoming decline: `Appointment request declined.`
- Admin modify upcoming: `Scheduled appointment modified.`
