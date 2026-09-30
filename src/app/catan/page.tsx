import type { Metadata } from 'next';
import CatanApp from '@/components/catan/catan-app';
import './catan.css';
export const metadata: Metadata = {
  title: 'Catan · Arnav Kulkarni',
  description: 'An island, a few friends, and a race to ten. Play Catan together with 3–6 players.',
};
export default async function CatanPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string | string[] }>;
}) {
  const { room } = await searchParams;
  return <CatanApp initialCode={typeof room === 'string' ? room.toUpperCase() : ''} />;
}
