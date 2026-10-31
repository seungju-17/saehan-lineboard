import { adminInbox } from '@/lib/repo';
import { Inbox } from '@/components/inbox';

export const dynamic = 'force-dynamic';
export default function InboxPage(): React.ReactElement {
  return <Inbox initial={adminInbox()} />;
}
