import Link from 'next/link';
import { CandidateFirmManager } from '@/components/modules/candidate-firm-manager';
import { StaffDashboardGuard } from '@/components/modules/staff-dashboard-guard';

export default function CandidateManagementPage() {
  return (
    <StaffDashboardGuard>
      <main className="mx-auto min-h-screen max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              Zenith Legal Operations
            </p>
            <h1 className="text-3xl font-bold text-slate-900">Candidate Firm Manager</h1>
            <p className="text-slate-600">
              Staff-only candidate firm assignments and status controls.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to dashboard
          </Link>
        </div>

        <CandidateFirmManager />
      </main>
    </StaffDashboardGuard>
  );
}
