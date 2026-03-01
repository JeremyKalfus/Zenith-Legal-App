import type { ReactNode } from 'react';
import { StaffDashboardGuard } from '@/components/modules/staff-dashboard-guard';

export default function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <StaffDashboardGuard>{children}</StaffDashboardGuard>;
}
