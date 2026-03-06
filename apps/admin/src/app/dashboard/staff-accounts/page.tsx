import { StaffAccountManager } from '@/components/modules/staff-account-manager';
import { StaffDashboardShell } from '@/components/modules/staff-dashboard-shell';

export default function StaffAccountsPage() {
  return (
    <StaffDashboardShell
      title="Staff Account Manager"
      description="Staff-only account review and deletion controls for recruiter users."
      actions={[
        { href: '/dashboard/candidates', label: 'Open Candidate Manager' },
        { href: '/dashboard/messages', label: 'Open Messages' },
        { href: '/dashboard', label: 'Back to dashboard' },
      ]}
    >
      <StaffAccountManager />
    </StaffDashboardShell>
  );
}
