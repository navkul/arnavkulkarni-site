import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import type { BlogMeta } from '@/lib/blogs';

interface HomePageProps {
  blogs: BlogMeta[];
  introHtml: string;
}

export function HomePage({ blogs, introHtml }: HomePageProps) {
  return (
    <main className="min-h-[calc(100dvh-var(--site-footer-height))] bg-background text-[15px] leading-relaxed text-foreground">
      <div className="max-w-4xl mx-auto px-6 py-12 lg:py-20">
        <section id="about" aria-label="About" className="scroll-mt-20 mb-6">
          <div className="profile-readme" dangerouslySetInnerHTML={{ __html: introHtml }} />
        </section>

        <section id="blogs" aria-label="Blogs" className="scroll-mt-20">
          {blogs.length === 0 ? (
            <p className="text-gray-500">No blogs just yet — check back soon.</p>
          ) : (
            <ul className="list-none space-y-6">
              {blogs.map((blog) => (
                <li key={blog.slug} className="flex flex-col gap-1">
                  <Link href={`/blogs/${blog.slug}`}>{blog.title}</Link>
                  <div className="flex flex-wrap gap-x-4 text-gray-500">
                    <time dateTime={blog.date}>{format(parseISO(blog.date), 'MMM d, yyyy')}</time>
                    <span>{blog.readingTimeMinutes} min read</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

export default HomePage;
