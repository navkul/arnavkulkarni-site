import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { getBlogBySlug, getPublishedBlogs } from '@/lib/blogs';
import BlogPostContent from '@/components/blog-post-content';
import { getPathLastUpdated } from '@/lib/last-updated';

interface BlogPostPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  return getPublishedBlogs().map((blog) => ({
    slug: blog.slug,
  }));
}

export async function generateMetadata({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const blog = await getBlogBySlug(slug);
  if (!blog) {
    return {
      title: 'Blog Not Found | Arnav Kulkarni',
    };
  }

  return {
    title: `${blog.meta.title} | Arnav Kulkarni`,
    description: `Read ${blog.meta.title} by Arnav Kulkarni.`,
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const blog = await getBlogBySlug(slug);

  if (!blog) {
    notFound();
  }

  const lastUpdated = await getPathLastUpdated(`content/blogs/${slug}.md`);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/#blogs" className="text-sm text-blue-600 hover:underline">
          ← Back
        </Link>
        <article className="mt-8">
          <header className="mb-10">
            <h1 className="text-4xl font-semibold mb-4">{blog.meta.title}</h1>
            <div className="space-y-1">
              <time className="block text-sm text-gray-500">
                Published {format(parseISO(blog.meta.date), 'MMMM d, yyyy')}
              </time>
              {lastUpdated ? (
                <p className="text-xs text-gray-400">
                  Last updated {format(new Date(lastUpdated), 'MMMM d, yyyy')}
                </p>
              ) : null}
            </div>
          </header>

          <BlogPostContent html={blog.html} />
        </article>
      </div>
    </div>
  );
}
