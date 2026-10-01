import { redirect } from 'next/navigation';

/** Keep existing table links working after returning to the original /catan layout. */
export default async function LegacyCatanPlayPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string | string[]; hosting?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['room', 'hosting'] as const) {
    const value = params[key];
    if (typeof value === 'string') query.set(key, value);
    else value?.forEach((item) => query.append(key, item));
  }
  const suffix = query.toString();
  redirect(`/catan${suffix ? `?${suffix}` : ''}`);
}
