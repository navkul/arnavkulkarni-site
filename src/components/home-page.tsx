'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  blogIntro,
  experiences,
  projects,
  researchDescription,
  researchLinks,
  researchTitle,
  researchUrl,
} from '@/lib/constants';
import type { BlogMeta } from '@/lib/blogs';
import type { RunningActivity, RunningOverview } from '@/lib/strava';
import RaceMap from './race-map';

interface HomePageProps {
  blogs: BlogMeta[];
  runningOverview: RunningOverview;
}

const formatMovingTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes}m`;
  }

  return `${hours}h ${remainingMinutes.toString().padStart(2, '0')}m`;
};

const formatStat = (value: number | null, suffix: string) => (value === null ? null : `${value}${suffix}`);

const formatElevationRange = (low: number | null, high: number | null) => {
  if (low === null || high === null) {
    return null;
  }

  return `${low}-${high} ft`;
};

function RaceDetailStats({ race }: { race: RunningActivity }) {
  const stats = [
    ['Elapsed', formatMovingTime(race.elapsedMinutes)],
    ['Avg speed', formatStat(race.averageSpeedMph, ' mph')],
    ['Max speed', formatStat(race.maxSpeedMph, ' mph')],
    ['Fastest split', race.fastestSplit ? `Mile ${race.fastestSplit.mile} • ${race.fastestSplit.pacePerMile}/mi` : null],
    ['Calories', formatStat(race.calories, ' cal')],
    ['Avg HR', formatStat(race.averageHeartrate, ' bpm')],
    ['Max HR', formatStat(race.maxHeartrate, ' bpm')],
    ['Avg cadence', formatStat(race.averageCadence, ' spm')],
    ['Weighted power', formatStat(race.weightedPower, ' W')],
    ['Elevation range', formatElevationRange(race.elevationLowFeet, race.elevationHighFeet)],
  ].filter(([, value]) => value !== null);

  if (stats.length === 0) {
    return null;
  }

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-gray-200 pt-5 text-sm">
      {stats.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs uppercase text-gray-500">{label}</dt>
          <dd className="mt-1">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RunningSection({ runningOverview }: { runningOverview: RunningOverview }) {
  const { races, weeklyStats } = runningOverview;
  const syncedAt = runningOverview.fetchedAt ? format(parseISO(runningOverview.fetchedAt), 'MMM d') : null;

  return (
    <section id="running" className="mb-12">
      <h2 className="text-3xl font-medium mb-12">Running</h2>
      <div className="max-w-4xl space-y-10">
        <div className="max-w-2xl">
          <p className="text-md leading-relaxed">
            I&apos;ve hated running till Oct 2025. Honestly not sure what changed, but I&apos;m hooked. Sharing some of
            my races and training with the pretty neat Strava API.
          </p>
          <p className="mt-3 text-xs text-gray-500">
            {runningOverview.source === 'strava'
              ? `Synced from Strava${syncedAt ? ` on ${syncedAt}` : ''}.`
              : runningOverview.message}
          </p>
        </div>

        <div>
          <h3 className="text-2xl font-medium mb-6">Races</h3>
          {races.length > 0 ? (
            <div className="space-y-10">
              {races.map((race) => (
                <div
                  key={race.id}
                  className="grid gap-8 md:grid-cols-[minmax(0,0.85fr)_minmax(340px,1.15fr)]"
                >
                  <div className="space-y-5">
                    <div>
                      {race.raceNoteSlug ? (
                        <Link
                          href={`/running/races/${race.raceNoteSlug}`}
                          className="text-xl font-medium hover:text-blue-600 transition-colors"
                        >
                          {race.name}
                        </Link>
                      ) : (
                        <h4 className="text-xl font-medium">{race.name}</h4>
                      )}
                      <p className="mt-2 text-sm text-gray-600">
                        {format(parseISO(race.startDate), 'MMM d, yyyy')} • {race.sportType}
                      </p>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-[1.15fr_1fr_1.15fr_1fr]">
                      <div>
                        <dt className="text-xs uppercase text-gray-500">Distance</dt>
                        <dd className="text-lg whitespace-nowrap">{race.distanceMiles} mi</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase text-gray-500">Time</dt>
                        <dd className="text-lg whitespace-nowrap">{formatMovingTime(race.movingMinutes)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase text-gray-500">Pace</dt>
                        <dd className="text-lg whitespace-nowrap">{race.pacePerMile ? `${race.pacePerMile}/mi` : '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase text-gray-500">Climb</dt>
                        <dd className="text-lg whitespace-nowrap">{race.elevationFeet} ft</dd>
                      </div>
                    </dl>

                    <RaceDetailStats race={race} />
                  </div>

                  <RaceMap activity={race} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              No races were detected from recent Strava runs yet. I can also wire this to a manual race list if the
              automatic matching misses anything.
            </p>
          )}
        </div>

        <div className="max-w-3xl">
          <h3 className="text-2xl font-medium mb-6">Latest Runs</h3>
          <div className="mb-8">
            <p className="text-sm text-gray-600">Last 7 days</p>
            <p className="mt-2 text-sm leading-relaxed">
              {weeklyStats.runCount} runs • {weeklyStats.distanceMiles} miles • {weeklyStats.movingHours} hours
              moving • {weeklyStats.elevationFeet} ft climbing
            </p>
          </div>
          {runningOverview.latestRuns.length > 0 ? (
            <ul className="space-y-4">
              {runningOverview.latestRuns.map((run) => (
                <li key={run.id} className="border-t border-gray-200 pt-4">
                  <h4 className="font-medium">{run.name}</h4>
                  <p className="mt-1 text-sm text-gray-600">
                    {format(parseISO(run.startDate), 'MMM d')} • {run.distanceMiles} mi •{' '}
                    {formatMovingTime(run.movingMinutes)} •{' '}
                    {run.pacePerMile ? `${run.pacePerMile}/mi` : 'pace n/a'}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">
                    {run.description ?? 'No description provided for this activity.'}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Recent runs will appear here after the first successful sync.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function HomePage({ blogs, runningOverview }: HomePageProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileNavButtonClass =
    'block w-full appearance-none bg-transparent border-0 px-3 text-left text-[color:var(--primary)] underline-offset-4 transition-colors hover:underline focus-visible:underline focus-visible:outline-none active:underline';
  const mobileNavPrimaryButtonClass = `${mobileNavButtonClass} py-2 text-sm`;
  const mobileNavSecondaryButtonClass = `${mobileNavButtonClass} py-1 text-xs`;

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const offset = 80; // Account for mobile header height
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile Navigation */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background border-b border-gray-200">
        <div className="flex justify-end items-center px-4 py-3">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2"
            aria-label="Toggle navigation"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
        {isMobileMenuOpen && (
          <div className="border-t border-gray-200 bg-background">
            <nav className="px-4 py-2 space-y-1">
              <button
                type="button"
                onClick={() => scrollToSection('about')}
                className={mobileNavPrimaryButtonClass}
              >
                About
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('work')}
                className={mobileNavPrimaryButtonClass}
              >
                Work
              </button>
              <div className="pl-4 space-y-1">
                <button
                  type="button"
                  onClick={() => scrollToSection('experience')}
                  className={mobileNavSecondaryButtonClass}
                >
                  Experience
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('research')}
                  className={mobileNavSecondaryButtonClass}
                >
                  Research
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('projects')}
                  className={mobileNavSecondaryButtonClass}
                >
                  Projects
                </button>
              </div>
              <button
                type="button"
                onClick={() => scrollToSection('running')}
                className={mobileNavPrimaryButtonClass}
              >
                Running
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('blogs')}
                className={mobileNavPrimaryButtonClass}
              >
                Blogs
              </button>

              {/* Mobile Social Links */}
              <div className="border-t border-gray-200 mt-4 pt-4">
                <div className="flex space-x-4">
                  <a
                    href="https://github.com/navkul"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    GitHub
                  </a>
                  <a
                    href="https://www.linkedin.com/in/arnav-a-kulkarni/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    LinkedIn
                  </a>
                  <a href="mailto:akul@bu.edu" className="text-sm text-blue-600 hover:underline">
                    Email
                  </a>
                </div>
              </div>
            </nav>
          </div>
        )}
      </div>

      {/* Desktop Layout */}
      <div className="lg:flex lg:min-h-screen">
        {/* Main Content */}
        <main className="flex-1 lg:ml-0 lg:pt-0 pt-16">
          <div className="max-w-4xl mx-auto px-6 py-12 lg:py-20">
            {/* About Section */}
            <section id="about" className="mb-12">
              <h2 className="text-3xl font-medium mb-12">About</h2>
              <div className="max-w-2xl">
                <p className="text-md leading-relaxed">
                  I&apos;m a student at Boston University pursuing a double major in Computer Science and Economics.
                  I&apos;m primarily interested in distributed systems, with my past internship and current research
                  focusing on stateful, fault-tolerant stream processing engines. I&apos;m also interested in
                  distributed infrastructure for AI/ML systems.
                </p>
                <p className="text-md leading-relaxed mt-4">
                  In economics, I enjoy thinking about macroeconomic growth, productivity, and the aggregate impacts
                  of technological change and automation.
                </p>
                <p className="text-md leading-relaxed mt-4">
                  In my free time, I&apos;m likely playing or watching soccer (an Arsenal fan, sadly), strength
                  training, or running.
                </p>
              </div>
            </section>
            {/* Work Section */}
            <section id="work" className="mb-12">
              <h2 className="text-3xl font-medium mb-12">Work</h2>

              {/* Experience Subsection */}
              <div id="experience" className="mb-12">
                <h3 className="text-2xl font-medium mb-8">Experience</h3>
                <div className="max-w-3xl space-y-8">
                  {experiences.map((experience, index) => (
                    <div key={index}>
                      <h4 className="text-xl font-medium mb-2">
                        {experience.companyUrl ? (
                          <a
                            href={experience.companyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-600 transition-colors"
                          >
                            {experience.title}
                          </a>
                        ) : (
                          experience.title
                        )}
                      </h4>
                      <p className="text-gray-600 mb-2">
                        {experience.role && `${experience.role} • `}
                        {experience.location && `${experience.location} • `}
                        {experience.period}
                      </p>
                      <ul className="text-sm leading-relaxed space-y-1">
                        {Array.isArray(experience.description) ? (
                          experience.description.map((item, i) => (
                            <li key={i} className="flex items-start">
                              <span className="text-gray-400 mr-2 mt-1">●</span>
                              <span>
                                {i === 1
                                  ? item.split('OpenTelemetry').map((part, j, array) => {
                                      if (j === array.length - 1) return part;
                                      return (
                                        <span key={j}>
                                          {part}
                                          <a
                                            href="https://docs.grepr.ai/sources-sinks/integrations/OpenTelemetry/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline"
                                          >
                                            OpenTelemetry
                                          </a>
                                        </span>
                                      );
                                    })
                                  : item}
                              </span>
                            </li>
                          ))
                        ) : (
                          <li className="flex items-start">
                            <span className="text-gray-400 mr-2 mt-1">●</span>
                            <span>{experience.description}</span>
                          </li>
                        )}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              {/* Research Subsection */}
              <div id="research" className="mb-12">
                <h3 className="text-2xl font-medium mb-6">Research</h3>

                <div className="max-w-3xl">
                  <h4 className="text-xl font-medium">
                    <a
                      href={researchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-600 transition-colors"
                    >
                      {researchTitle}
                    </a>
                  </h4>
                  <p className="text-sm leading-relaxed mt-3 text-gray-700">{researchDescription}</p>
                  <div className="flex flex-wrap gap-4 mt-5 text-sm">
                    {researchLinks.map((link) => (
                      <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {link.label} ↗
                      </a>
                    ))}
                  </div>
                </div>
              </div>

              {/* Projects Subsection */}
              <div id="projects">
                <h3 className="text-2xl font-medium mb-8">Projects</h3>
                <div className="max-w-4xl grid md:grid-cols-2 gap-8">
                  {projects.map((project, index) => (
                    <div key={index}>
                      <h4 className="text-xl font-medium mb-2">
                        {project.githubUrl ? (
                          <a
                            href={project.githubUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-600 transition-colors"
                          >
                            {project.title}
                            <span className="ml-2 text-sm text-gray-400">↗</span>
                          </a>
                        ) : (
                          project.title
                        )}
                      </h4>
                      <p className="text-gray-600 mb-2">{project.type}</p>
                      <ul className="text-sm leading-relaxed space-y-1">
                        {Array.isArray(project.description) ? (
                          project.description.map((item, i) => (
                            <li key={i} className="flex items-start">
                              <span className="text-gray-400 mr-2 mt-1">●</span>
                              <span>{item}</span>
                            </li>
                          ))
                        ) : (
                          <li className="flex items-start">
                            <span className="text-gray-400 mr-2 mt-1">●</span>
                            <span>{project.description}</span>
                          </li>
                        )}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <RunningSection runningOverview={runningOverview} />

            {/* Blogs Section */}
            <section id="blogs" className="mb-12">
              <h2 className="text-3xl font-medium mb-12">Blogs</h2>
              <div className="max-w-2xl">
                <p className="text-md leading-relaxed mb-8">
                  {blogIntro}
                </p>
                {blogs.length === 0 ? (
                  <p className="text-sm text-gray-500">No blogs just yet — check back soon.</p>
                ) : (
                  <ul className="space-y-6">
                    {blogs.map((blog) => (
                      <li key={blog.slug} className="flex items-start">
                        <span className="text-gray-400 mr-3 mt-1">●</span>
                        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
                          <Link
                            href={`/blogs/${blog.slug}`}
                            className="text-lg font-medium hover:text-blue-600 transition-colors"
                          >
                            {blog.title}
                          </Link>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
                            <time>
                              {format(parseISO(blog.date), 'MMM d, yyyy')}
                            </time>
                            <span aria-hidden="true">•</span>
                            <span>{blog.readingTimeMinutes} min read</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </main>

        {/* Desktop Index Navigation */}
        <aside className="hidden lg:block w-64 border-l border-gray-200 bg-background">
          <div className="sticky top-0 p-6">
            {/* Desktop Social Links */}
            <div className="flex space-x-4 mb-6">
              <a
                href="https://github.com/navkul"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline"
              >
                GitHub
              </a>
              <a
                href="https://www.linkedin.com/in/arnav-a-kulkarni/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline"
              >
                LinkedIn
              </a>
              <a href="mailto:akul@bu.edu" className="text-sm text-blue-600 hover:underline">
                Email
              </a>
            </div>

            <nav className="space-y-4">
              <div>
                <a
                  href="#about"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection('about');
                  }}
                  className="block text-sm text-blue-600"
                >
                  About
                </a>
              </div>

              <div>
                <a
                  href="#work"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection('work');
                  }}
                  className="block text-sm text-blue-600"
                >
                  Work
                </a>
                <div className="ml-4 mt-2 space-y-2">
                  <a
                    href="#experience"
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToSection('experience');
                    }}
                    className="block text-xs text-blue-600"
                  >
                    Experience
                  </a>
                  <a
                    href="#research"
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToSection('research');
                    }}
                    className="block text-xs text-blue-600"
                  >
                    Research
                  </a>
                  <a
                    href="#projects"
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToSection('projects');
                    }}
                    className="block text-xs text-blue-600"
                  >
                    Projects
                  </a>
                </div>
              </div>

              <div>
                <a
                  href="#running"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection('running');
                  }}
                  className="block text-sm text-blue-600"
                >
                  Running
                </a>
              </div>

              <div>
                <a
                  href="#blogs"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection('blogs');
                  }}
                  className="block text-sm text-blue-600"
                >
                  Blogs
                </a>
              </div>
            </nav>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default HomePage;
