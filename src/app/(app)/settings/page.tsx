import { getSettings, listPosts } from '@/lib/repo';
import { SettingsForm } from '@/components/settings';

export const dynamic = 'force-dynamic';
export default function SettingsPage(): React.ReactElement {
  return <SettingsForm initial={getSettings()} lines={listPosts()} />;
}
