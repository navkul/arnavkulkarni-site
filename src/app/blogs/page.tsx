import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { getPublishedBlogs } from '@/lib/blogs';
import { blogIntro } from '@/lib/constants';

export const metadata = {
  title: 'Blogs | Arnav Kulkarni',
  description: blogIntro,
};

export default function BlogsPage() {
  const blogs = getPublishedBlogs();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-semibold mb-8">Blogs</h1>
        <p className="text-gray-600 mb-12">
          {blogIntro}
        </p>

        {blogs.length === 0 ? (
          <p className="text-gray-500">No blog posts yet. Check back soon.</p>
        ) : (
          <ul className="space-y-6">
            {blogs.map((blog) => (
              <li key={blog.slug} className="border-b border-gray-200 pb-6 last:border-b-0">
                <Link
                  href={`/blogs/${blog.slug}`}
                  className="group"
                >
                  <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2">
                    <h2 className="text-2xl font-medium group-hover:text-blue-600 transition-colors">
                      {blog.title}
                    </h2>
                    <time className="text-sm text-gray-500">
                      {format(parseISO(blog.date), 'MMMM d, yyyy')}
                    </time>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
