'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import type { BlogMeta } from '@/lib/blogs';

interface HomePageProps {
  blogs: BlogMeta[];
  introHtml: string;
}

const sections = [
  { id: 'about', label: 'About' },
  { id: 'blogs', label: 'Blogs' },
];

function SocialLinks() {
  return (
    <div className="flex gap-3">
      <a href="https://github.com/navkul" target="_blank" rel="noopener noreferrer">
        GitHub
      </a>
      <a
        href="https://www.linkedin.com/in/arnav-a-kulkarni/"
        target="_blank"
        rel="noopener noreferrer"
      >
        LinkedIn
      </a>
      <a href="mailto:akul@bu.edu">Email</a>
    </div>
  );
}

export function HomePage({ blogs, introHtml }: HomePageProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-[15px] leading-relaxed text-foreground">
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background border-b border-gray-200">
        <div className="flex justify-end items-center px-4 py-3">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2"
            aria-label="Toggle navigation"
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-navigation"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>
        {isMobileMenuOpen && (
          <nav
            id="mobile-navigation"
            aria-label="Mobile navigation"
            className="border-t border-gray-200 px-6 py-4 space-y-3"
          >
            {sections.map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block"
              >
                {label}
              </a>
            ))}
            <Link href="/catan" className="block">
              Play Catan
            </Link>
            <div className="border-t border-gray-200 pt-4">
              <SocialLinks />
            </div>
          </nav>
        )}
      </div>

      <div className="lg:flex lg:min-h-screen">
        <main className="min-w-0 flex-1 pt-16 lg:pt-0">
          <div className="max-w-4xl mx-auto px-6 py-12 lg:py-20">
            <section id="about" aria-label="About" className="scroll-mt-20 mb-16">
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
                        <time dateTime={blog.date}>
                          {format(parseISO(blog.date), 'MMM d, yyyy')}
                        </time>
                        <span>{blog.readingTimeMinutes} min read</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </main>

        <aside className="hidden lg:block w-64 shrink-0 border-l border-gray-200 bg-background">
          <div className="sticky top-0 px-6 py-20">
            <div className="mb-6">
              <SocialLinks />
            </div>
            <nav aria-label="Page navigation" className="space-y-4">
              {sections.map(({ id, label }) => (
                <a key={id} href={`#${id}`} className="block">
                  {label}
                </a>
              ))}
              <Link href="/catan" className="block">
                Play Catan
              </Link>
            </nav>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default HomePage;
