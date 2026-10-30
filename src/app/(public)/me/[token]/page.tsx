import { MyWork } from './my-work';
export const dynamic = 'force-dynamic';
export default async function MePage({ params }: { params: Promise<{ token: string }> }): Promise<React.ReactElement> {
  const { token } = await params;
  return <MyWork token={token} />;
}
