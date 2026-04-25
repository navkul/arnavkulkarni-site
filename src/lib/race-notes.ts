import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { parseISO } from 'date-fns';
import { remark } from 'remark';
import html from 'remark-html';

const RACE_NOTES_DIR = path.join(process.cwd(), 'content', 'race-notes');
const WORDS_PER_MINUTE = 200;

type MarkdownNode = {
  value?: unknown;
  alt?: unknown;
  children?: MarkdownNode[];
};

export interface RaceNoteFrontmatter {
  title: string;
  date: string;
  published?: boolean;
  raceName?: string;
  activityId?: number;
}

export interface RaceNoteMeta extends RaceNoteFrontmatter {
  slug: string;
  readingTimeMinutes: number;
}

export interface RaceNote {
  meta: RaceNoteMeta;
  markdown: string;
  html: string;
}

const isDirectoryAvailable = (() => {
  try {
    fs.accessSync(RACE_NOTES_DIR, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
})();

const markdownToHtml = async (markdown: string) => {
  const processed = await remark().use(html).process(markdown);
  return processed.toString();
};

const markdownToPlainText = (markdown: string) => {
  const tree = remark().parse(markdown) as MarkdownNode;
  const parts: string[] = [];

  const visit = (node: MarkdownNode) => {
    if (typeof node.value === 'string') {
      parts.push(node.value);
    }

    if (typeof node.alt === 'string') {
      parts.push(node.alt);
    }

    node.children?.forEach(visit);
  };

  visit(tree);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

const getRaceNoteStats = (markdown: string) => {
  const plainText = markdownToPlainText(markdown);
  const wordCount = plainText === '' ? 0 : plainText.split(/\s+/).length;

  return {
    readingTimeMinutes: Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE)),
  };
};

const parseMatter = (filePath: string) => {
  const fileContents = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(fileContents);
  return {
    frontmatter: data as RaceNoteFrontmatter,
    content,
  };
};

export const getPublishedRaceNotes = (): RaceNoteMeta[] => {
  if (!isDirectoryAvailable) {
    return [];
  }

  const files = fs.readdirSync(RACE_NOTES_DIR).filter((file) => file.endsWith('.md'));

  const raceNotes = files.map((filename) => {
    const slug = filename.replace(/\.md$/, '');
    const { frontmatter, content } = parseMatter(path.join(RACE_NOTES_DIR, filename));

    return {
      ...frontmatter,
      slug,
      ...getRaceNoteStats(content),
    };
  });

  return raceNotes
    .filter((raceNote) => raceNote.published !== false)
    .sort((a, b) => {
      const aDate = parseISO(a.date).getTime();
      const bDate = parseISO(b.date).getTime();
      return bDate - aDate;
    });
};

export const getRaceNoteBySlug = async (slug: string): Promise<RaceNote | null> => {
  if (!isDirectoryAvailable) {
    return null;
  }

  const fullPath = path.join(RACE_NOTES_DIR, `${slug}.md`);
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const { frontmatter, content } = parseMatter(fullPath);
  if (frontmatter.published === false) {
    return null;
  }

  const htmlContent = await markdownToHtml(content);

  return {
    meta: {
      ...frontmatter,
      slug,
      ...getRaceNoteStats(content),
    },
    markdown: content,
    html: htmlContent,
  };
};
