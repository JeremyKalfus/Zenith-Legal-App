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
        </div>
        <OperationsDashboard />
      </main>
    </StaffDashboardGuard>
  );
}
