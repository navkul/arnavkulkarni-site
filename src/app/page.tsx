import { getPublishedBlogs } from '@/lib/blogs';
import { getRunningOverview } from '@/lib/strava';
import HomePage from '@/components/home-page';

export const revalidate = 604800;

export default async function Home() {
  const blogs = getPublishedBlogs();
  const runningOverview = await getRunningOverview();

  return <HomePage blogs={blogs} runningOverview={runningOverview} />;
}
