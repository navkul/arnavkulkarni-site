import type { Metadata } from 'next';
import Image from 'next/image';
import { format } from 'date-fns';
import { IBM_Plex_Mono } from 'next/font/google';
import { getSiteLastUpdated } from '@/lib/last-updated';
import './globals.css';

const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-ibm-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Arnav Kulkarni',
  description: 'Personal website and portfolio',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteLastUpdated = await getSiteLastUpdated();

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${ibmPlexMono.variable} antialiased`}>
        {children}
        <footer className="site-footer border-t border-gray-200 bg-background">
          <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-6">
            {siteLastUpdated ? (
              <p className="min-w-0 text-xs text-gray-500">
                Site last updated{' '}
                <time dateTime={siteLastUpdated}>
                  {format(new Date(siteLastUpdated), 'MMMM d, yyyy')}
                </time>
              </p>
            ) : null}
            <div className="flex shrink-0 items-center">
              <a
                href="https://github.com/navkul"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                title="GitHub"
                className="footer-icon-link"
              >
                <Image src="/icons/github.svg" alt="" width={16} height={16} unoptimized />
              </a>
              <a
                href="https://www.linkedin.com/in/arnav-a-kulkarni/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                title="LinkedIn"
                className="footer-icon-link"
              >
                <Image src="/icons/linkedin.ico" alt="" width={16} height={16} unoptimized />
              </a>
              <a
                href="mailto:akul@bu.edu"
                aria-label="Email"
                title="Email"
                className="footer-icon-link"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m3 6 9 7 9-7" />
                </svg>
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
