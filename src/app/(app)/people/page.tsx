import { getDb } from '@/lib/db';
import { people, weekHoursFor, getSettings } from '@/lib/repo';
import { todaySeoul } from '@/lib/shift';
import { People } from '@/components/people';

export const dynamic = 'force-dynamic';
export default function PeoplePage(): React.ReactElement {
  const h = weekHoursFor(todaySeoul()); const st = getSettings();
  return <People initial={people(getDb(), false).map((p) => ({ ...p, week_hours: h.get(p.id) ?? 0 }))} maxHours={st.week_max_hours} shiftHours={st.shift_hours} />;
}
