# Release and Environment Strategy

## Environments

- `dev`: local integration and rapid iteration
- `staging`: QA + integration + UAT
- `prod`: release

Each environment requires dedicated Supabase project, Stream app credentials, OAuth app IDs, Sentry DSN, and PostHog key.

## Mobile (EAS)

- Configure EAS project with environment-specific profiles.
- Internal testing channel first:
  - iOS: TestFlight internal
  - Android: Play Internal Testing

## Web Admin

- Deploy with Vercel using environment-specific secrets.

## Verification Gates

Before promotion to next environment:

1. `npm run verify` passes.
2. Mobile smoke test on iOS + Android.
3. Chat send/receive and push fallback tested.
4. Appointment create/update + reminder dispatch tested.
5. Staff status updates reflected in candidate dashboard.
