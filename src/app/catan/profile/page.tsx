import type { Metadata } from 'next';
import CatanProfile from '@/components/catan/profile';
import '../catan.css';
import { offlineOnly } from '@/lib/catan/server';
export const metadata: Metadata = { title: 'Your Catan profile · Arnav Kulkarni' };
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ hosting?: string; mode?: string; table?: string }>;
}) {
  const query = await searchParams;
  return (
    <CatanProfile
      hosting={query.hosting === 'local' || offlineOnly() ? 'local' : 'server'}
      initialMode={query.mode === 'register' ? 'register' : 'login'}
      tableCode={
        typeof query.table === 'string' && /^[A-Z2-9]{6}$/.test(query.table)
          ? query.table
          : undefined
      }
    />
  );
}
