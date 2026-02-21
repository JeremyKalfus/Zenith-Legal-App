# Verification Checklists

## Candidate Flow

- [ ] Intake validates required fields and Other-text rules.
- [ ] Candidate can verify with email magic link or SMS OTP.
- [ ] Dashboard shows only assigned firms in allowed statuses.
- [ ] One-click message opens Stream chat channel.
- [ ] Appointment create/update triggers notification entries.

## Staff Flow

- [ ] Staff login via invite-only magic link.
- [ ] Manual candidate-firm assignment applies default status.
- [ ] Status updates are staff-only and audited.
- [ ] Recruiter contact config updates mobile banner.
- [ ] Support data request processing writes audit trail.

## Security and RLS

- [ ] Candidate cannot read another candidate rows.
- [ ] Candidate cannot mutate staff-only tables.
- [ ] Staff-only edge functions reject non-staff caller.
- [ ] Chat webhook rejects invalid signature.
