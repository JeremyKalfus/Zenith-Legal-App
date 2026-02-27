import { CandidateFirmManager } from '@/components/modules/candidate-firm-manager';
import { StaffDashboardShell } from '@/components/modules/staff-dashboard-shell';

export default function CandidateManagementPage() {
  return (
    <StaffDashboardShell
      title="Candidate Firm Manager"
      description="Staff-only candidate firm assignments and status controls."
      actions={[
        { href: '/dashboard/messages', label: 'Open Messages' },
        { href: '/dashboard', label: 'Back to dashboard' },
      ]}
    >
      <CandidateFirmManager />
    </StaffDashboardShell>
  );
}
