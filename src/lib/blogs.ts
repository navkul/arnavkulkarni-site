import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import html from 'remark-html';

const BLOGS_DIR = path.join(process.cwd(), 'content', 'blogs');

export interface BlogFrontmatter {
  title: string;
  date: string;
  excerpt?: string;
  tags?: string[];
  published?: boolean;
}

export interface BlogMeta extends BlogFrontmatter {
  slug: string;
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
    const { frontmatter } = parseMatter(path.join(BLOGS_DIR, filename));

    return {
      ...frontmatter,
      slug,
    };
  });

  return blogs
    .filter((blog) => blog.published !== false)
    .sort((a, b) => {
      const aDate = new Date(a.date).getTime();
      const bDate = new Date(b.date).getTime();
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
    },
    markdown: content,
    html: htmlContent,
  };
};
