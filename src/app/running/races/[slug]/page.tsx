import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { getPathLastUpdated } from '@/lib/last-updated';
import { getPublishedRaceNotes, getRaceNoteBySlug } from '@/lib/race-notes';
import BlogPostContent from '@/components/blog-post-content';

interface RaceNotePageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  return getPublishedRaceNotes().map((raceNote) => ({
    slug: raceNote.slug,
  }));
}

export async function generateMetadata({ params }: RaceNotePageProps) {
  const { slug } = await params;
  const raceNote = await getRaceNoteBySlug(slug);
  if (!raceNote) {
    return {
      title: 'Race Note Not Found | Arnav Kulkarni',
    };
  }

  return {
    title: `${raceNote.meta.title} | Arnav Kulkarni`,
    description: `Race notes for ${raceNote.meta.title}.`,
  };
}

export default async function RaceNotePage({ params }: RaceNotePageProps) {
  const { slug } = await params;
  const raceNote = await getRaceNoteBySlug(slug);

  if (!raceNote) {
    notFound();
  }

  const lastUpdated = await getPathLastUpdated(`content/race-notes/${slug}.md`);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/#running" className="text-sm text-blue-600 hover:underline">
          ← Back
        </Link>
        <article className="mt-8">
          <header className="mb-10">
            <h1 className="text-4xl font-semibold mb-4">{raceNote.meta.title}</h1>
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Race note</p>
              <time className="block text-xs text-gray-400">Raced {format(parseISO(raceNote.meta.date), 'MMMM d, yyyy')}</time>
              {lastUpdated ? (
                <p className="text-xs text-gray-400">
                  Last updated {format(new Date(lastUpdated), 'MMMM d, yyyy')}
                </p>
              ) : null}
            </div>
          </header>

          <BlogPostContent html={raceNote.html} />
        </article>
      </div>
    </div>
  );
}
