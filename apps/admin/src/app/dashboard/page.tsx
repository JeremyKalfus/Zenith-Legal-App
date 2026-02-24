import Link from 'next/link';
import { OperationsDashboard } from '@/components/modules/operations-dashboard';
import { StaffDashboardGuard } from '@/components/modules/staff-dashboard-guard';

export default function DashboardPage() {
  return (
    <StaffDashboardGuard>
      <main className="mx-auto min-h-screen max-w-7xl px-4 py-8">
        <div className="mb-6 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
            Zenith Legal Operations
          </p>
          <h1 className="text-3xl font-bold text-slate-900">Staff Dashboard</h1>
          <p className="text-slate-600">
            Candidate workflow modules with staff-only status control and audited actions.
          </p>
          <div className="pt-2">
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/candidates"
                className="inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              >
                Open Candidate Firm Manager
              </Link>
              <Link
                href="/dashboard/messages"
                className="inline-flex h-10 items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Open Messages
              </Link>
            </div>
          </div>
        </div>
        <OperationsDashboard />
      </main>
    </StaffDashboardGuard>
  );
}
