import { allRequests } from '@/lib/repo';
import { Requests } from '@/components/requests';

export const dynamic = 'force-dynamic';
export default function RequestsPage(): React.ReactElement {
  return <Requests initial={allRequests()} />;
}
