import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { parseISO } from 'date-fns';
import { remark } from 'remark';
import html from 'remark-html';

const BLOGS_DIR = path.join(process.cwd(), 'content', 'blogs');
const WORDS_PER_MINUTE = 200;

type MarkdownNode = {
  value?: unknown;
  alt?: unknown;
  children?: MarkdownNode[];
};

export interface BlogFrontmatter {
  title: string;
  date: string;
  published?: boolean;
}

export interface BlogMeta extends BlogFrontmatter {
  slug: string;
  readingTimeMinutes: number;
}

export interface BlogPost {
  meta: BlogMeta;
  markdown: string;
  html: string;
}

const isDirectoryAvailable = (() => {
  try {
    fs.accessSync(BLOGS_DIR, fs.constants.R_OK);
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

const getBlogStats = (markdown: string) => {
  const plainText = markdownToPlainText(markdown);
  const wordCount = plainText === '' ? 0 : plainText.split(/\s+/).length;

  return {
    readingTimeMinutes: Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE)),
  };
};

const normalizeSlug = (filename: string) => filename.replace(/\.md$/, '');

const parseMatter = (filePath: string) => {
  const fileContents = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(fileContents);
  return {
    frontmatter: data as BlogFrontmatter,
    content,
  };
};

export const getPublishedBlogs = (): BlogMeta[] => {
  if (!isDirectoryAvailable) {
    return [];
  }

  const files = fs.readdirSync(BLOGS_DIR).filter((file) => file.endsWith('.md'));

  const blogs = files.map((filename) => {
    const slug = normalizeSlug(filename);
    const { frontmatter, content } = parseMatter(path.join(BLOGS_DIR, filename));

    return {
      ...frontmatter,
      slug,
      ...getBlogStats(content),
    };
  });

  return blogs
    .filter((blog) => blog.published !== false)
    .sort((a, b) => {
      const aDate = parseISO(a.date).getTime();
      const bDate = parseISO(b.date).getTime();
      return bDate - aDate;
    });
};

export const getBlogBySlug = async (slug: string): Promise<BlogPost | null> => {
  if (!isDirectoryAvailable) {
    return null;
  }

  const fullPath = path.join(BLOGS_DIR, `${slug}.md`);
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
      ...getBlogStats(content),
    },
    markdown: content,
    html: htmlContent,
  };
};
