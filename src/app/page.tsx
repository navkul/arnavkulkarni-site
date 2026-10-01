import { getPublishedBlogs } from '@/lib/blogs';
import { getProfileReadmeHtml } from '@/lib/profile-readme';
import HomePage from '@/components/home-page';

export const revalidate = 300;

export default async function Home() {
  const blogs = getPublishedBlogs();
  const introHtml = await getProfileReadmeHtml();

  return <HomePage blogs={blogs} introHtml={introHtml} />;
}
