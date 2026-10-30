import { getDb } from '@/lib/db';
import { people } from '@/lib/repo';
import { People } from '@/components/people';

export const dynamic = 'force-dynamic';
export default function PeoplePage(): React.ReactElement {
  return <People initial={people(getDb(), false)} />;
}
