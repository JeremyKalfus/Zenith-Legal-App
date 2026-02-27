import { StaffMessagesDashboard } from '@/components/modules/staff-messages-dashboard';
import { StaffDashboardShell } from '@/components/modules/staff-dashboard-shell';

export default function StaffMessagesPage() {
  return (
    <StaffDashboardShell
      title="Staff Messages"
      description="Inbox-first candidate DMs for recruiter staff on the admin web app."
      actions={[
        { href: '/dashboard/candidates', label: 'Candidate Manager' },
        { href: '/dashboard', label: 'Back to dashboard' },
      ]}
    >
      <StaffMessagesDashboard />
    </StaffDashboardShell>
  );
}
