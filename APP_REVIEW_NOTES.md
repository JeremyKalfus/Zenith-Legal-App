# App Review Notes

Use this as the source of truth for the App Store Connect "App Review Information" notes.

## Review Accounts

- Candidate account: `<candidate_test_email>` / `<candidate_test_password>`
- Recruiter staff account: `<staff_test_email>` / `<staff_test_password>`

## What The App Does

Zenith Legal is a recruiter-mediated legal recruiting app.

- Candidate users review recruiter-assigned firms, authorize submissions, message the Zenith team, and manage appointments.
- Recruiter staff users manage candidate activity, messaging, and appointments.

## How To Review

1. Launch the app and sign in with the candidate account.
2. Candidate flow to review:
   - Dashboard: view assigned firms and authorize or cancel a pending submission decision
   - Messages: open the existing recruiter conversation
   - Appointments: review outgoing requests and scheduled appointments
   - Profile: review settings, optional device-calendar sync, and in-app account deletion
3. Sign out and sign in with the recruiter staff account.
4. Staff flow to review:
   - Candidates: open the candidate list and candidate detail
   - Messages: reply to the candidate conversation
   - Appointments: review or create appointments
   - Profile: review optional device-calendar sync and in-app account deletion

## Permissions

- Push notifications are optional and are requested only if a candidate opts in to job-opportunity alerts.
- Calendar access is optional and is used only to sync scheduled appointments into the local calendar on the current device.
- Core app review does not require granting either permission.

## Purchases

- The app does not use in-app purchases or subscriptions for the reviewable flows in this build.

## Notes

- Please use seeded review accounts so the main dashboard, messaging, and appointments flows already contain reviewable data.
- Messaging is between the signed-in user and Zenith Legal recruiter staff only; the app does not contain public social posting.
- If you test account deletion, please use a disposable review account rather than the primary staff account.
