import { StaffAuthRedirect } from '@/components/modules/staff-auth-redirect';
import { StaffLoginCard } from '@/components/modules/staff-login-card';

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-12">
      <StaffAuthRedirect />
      <div className="mb-10 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
          Zenith Legal
        </p>
        <h1 className="text-3xl font-bold text-slate-900">Recruiter Admin Portal</h1>
        <p className="text-slate-600">
          Invite-only operations dashboard for candidates, assignments, statuses, and
          appointments.
        </p>
      </div>
      <StaffLoginCard />
    </main>
  );
}
