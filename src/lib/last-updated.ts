import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { cache } from 'react';

const REPO_ROOT = process.cwd();
const GITHUB_REPO =
  process.env.GIT_LAST_UPDATED_REPO ??
  process.env.GITHUB_REPOSITORY ??
  'nav-kulkarni/arnavkulkarni-site';
const GITHUB_REF = process.env.GIT_LAST_UPDATED_REF ?? 'main';

interface GitHubCommit {
  commit?: {
    author?: {
      date?: string;
    };
    committer?: {
      date?: string;
    };
  };
}

const normalizeTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  return Number.isNaN(Date.parse(value)) ? null : value;
};

const readGitTimestamp = (args: string[]) => {
  try {
    const output = execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return normalizeTimestamp(output);
  } catch {
    return null;
  }
};

const readFileTimestamp = (relativePath: string) => {
  try {
    return normalizeTimestamp(
      fs.statSync(path.join(REPO_ROOT, relativePath)).mtime.toISOString(),
    );
  } catch {
    return null;
  }
};

const readGitHubTimestamp = cache(async (relativePath?: string) => {
  const url = new URL(`https://api.github.com/repos/${GITHUB_REPO}/commits`);
  url.searchParams.set('per_page', '1');
  url.searchParams.set('sha', GITHUB_REF);

  if (relativePath) {
    url.searchParams.set('path', relativePath);
  }

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return null;
    }

    const commits = (await response.json()) as GitHubCommit[];
    return normalizeTimestamp(
      commits[0]?.commit?.committer?.date ?? commits[0]?.commit?.author?.date,
    );
  } catch {
    return null;
  }
});

export const getSiteLastUpdated = cache(async () => {
  return readGitTimestamp(['log', '-1', '--format=%cI', 'HEAD']) ?? readGitHubTimestamp();
});

export const getPathLastUpdated = cache(async (relativePath: string) => {
  return (
    readGitTimestamp(['log', '-1', '--follow', '--format=%cI', '--', relativePath]) ??
    readGitHubTimestamp(relativePath) ??
    readFileTimestamp(relativePath)
  );
});
