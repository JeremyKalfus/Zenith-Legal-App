import Link from 'next/link';
import Image from 'next/image';
import { OperationsDashboard } from '@/components/modules/operations-dashboard';

export default function DashboardPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
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
        <Link href="/dashboard" className="inline-flex" aria-label="Zenith Legal dashboard">
          <Image
            src="/zenith-legal-logo.png"
            alt="Zenith Legal"
            width={120}
            height={48}
            className="h-12 w-auto"
            priority
          />
        </Link>
      </div>
      <OperationsDashboard />
    </main>
  );
}
