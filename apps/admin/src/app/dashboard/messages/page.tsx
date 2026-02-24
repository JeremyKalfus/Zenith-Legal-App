import Link from 'next/link';
import { StaffMessagesDashboard } from '@/components/modules/staff-messages-dashboard';
import { StaffDashboardGuard } from '@/components/modules/staff-dashboard-guard';

export default function StaffMessagesPage() {
  return (
    <StaffDashboardGuard>
      <main className="mx-auto min-h-screen max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              Zenith Legal Operations
            </p>
            <h1 className="text-3xl font-bold text-slate-900">Staff Messages</h1>
            <p className="text-slate-600">
              Inbox-first candidate DMs for recruiter staff on the admin web app.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard/candidates"
              className="inline-flex h-10 items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Candidate Manager
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back to dashboard
            </Link>
          </div>
        </div>

        <StaffMessagesDashboard />
      </main>
    </StaffDashboardGuard>
  );
}
