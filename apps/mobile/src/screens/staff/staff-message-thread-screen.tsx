import { MessagesScreen } from '../candidate/messages-screen';

export function StaffMessageThreadScreen({
  candidateUserId,
}: {
  candidateUserId: string;
}) {
  return <MessagesScreen showRecruiterBanner={false} candidateUserId={candidateUserId} />;
}
