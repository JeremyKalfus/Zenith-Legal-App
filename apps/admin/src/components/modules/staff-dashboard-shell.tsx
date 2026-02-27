import Link from 'next/link';
import type { ReactNode } from 'react';
import { StaffDashboardGuard } from '@/components/modules/staff-dashboard-guard';

type DashboardAction = {
  href: string;
  label: string;
};

type StaffDashboardShellProps = {
  title: string;
  description: string;
  actions: DashboardAction[];
  children: ReactNode;
};

export function StaffDashboardShell({
  title,
  description,
  actions,
  children,
}: StaffDashboardShellProps) {
  return (
    <StaffDashboardGuard>
      <main className="mx-auto min-h-screen max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              Zenith Legal Operations
            </p>
            <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
            <p className="text-slate-600">{description}</p>
          </div>
          <div className="flex gap-2">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="inline-flex h-10 items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {action.label}
              </Link>
            ))}
          </div>
        </div>

        {children}
      </main>
    </StaffDashboardGuard>
  );
}
