import type { Metadata } from 'next';
import CatanApp from '@/components/catan/catan-app';
import './catan.css';
import { localAvailable, offlineOnly } from '@/lib/catan/server';
export const metadata: Metadata = {
  title: 'Catan · Arnav Kulkarni',
  description: 'An island, a few friends, and a race to ten. Play Catan together with 3–6 players.',
};
export default async function CatanPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string | string[]; hosting?: string }>;
}) {
  const { room, hosting } = await searchParams;
  return (
    <CatanApp
      initialCode={typeof room === 'string' ? room.toUpperCase() : ''}
      initialHosting={hosting === 'local' || offlineOnly() ? 'local' : 'server'}
      localAvailable={localAvailable()}
      localOnly={offlineOnly()}
    />
  );
}
