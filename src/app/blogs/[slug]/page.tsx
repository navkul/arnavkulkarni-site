import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { getBlogBySlug, getPublishedBlogs } from '@/lib/blogs';
import BlogPostContent from '@/components/blog-post-content';

interface BlogPostPageProps {
  params: {
    slug: string;
  };
}

export async function generateStaticParams() {
  return getPublishedBlogs().map((blog) => ({
    slug: blog.slug,
  }));
}

export async function generateMetadata({ params }: BlogPostPageProps) {
  const blog = await getBlogBySlug(params.slug);
  if (!blog) {
    return {
      title: 'Blog Not Found | Arnav Kulkarni',
    };
  }

  return {
    title: `${blog.meta.title} | Arnav Kulkarni`,
    description: blog.meta.excerpt ?? `Read ${blog.meta.title} by Arnav Kulkarni.`,
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const blog = await getBlogBySlug(params.slug);

  if (!blog) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/#blogs" className="text-sm text-blue-600 hover:underline">
        ← Back
        </Link>
        <article className="mt-8">
          <header className="mb-10">
            <h1 className="text-4xl font-semibold mb-4">{blog.meta.title}</h1>
            <time className="text-sm text-gray-500">
              {format(new Date(blog.meta.date), 'MMMM d, yyyy')}
            </time>
          </header>

          <BlogPostContent html={blog.html} />
        </article>
      </div>
    </div>
  );
}
