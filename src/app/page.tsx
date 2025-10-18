import { getPublishedBlogs } from '@/lib/blogs';
import HomePage from '@/components/home-page';

export default function Home() {
  const blogs = getPublishedBlogs();
  return <HomePage blogs={blogs} />;
}
