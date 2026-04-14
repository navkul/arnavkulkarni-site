# Arnav Kulkarni Site

Personal site built with Next.js. Blog posts live in `content/blogs` as markdown files.

## Local Development

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## How To Create A Blog Post

1. Create a new markdown file in `content/blogs`.
2. Name the file with the slug you want in the URL.
   `content/blogs/2026-04-14-checkpoint-tuning.md` becomes `/blogs/2026-04-14-checkpoint-tuning`.
3. Add frontmatter at the top of the file.
4. Write the body in normal markdown below the frontmatter.
5. Commit the file. The post page reads its "Last updated" value from the latest commit that touched that markdown file.
6. Push or deploy your changes. The site footer reads its "Site last updated" value from the latest commit on the repo.

Required frontmatter:

- `title`: post title
- `date`: publish date in `YYYY-MM-DD` format

Optional frontmatter:

- `excerpt`: short summary used for metadata/SEO
- `published`: set to `false` to hide a draft

Do not add `tags` or a manual `lastUpdated` field. The site does not use tags, and last-updated dates are derived automatically from git history.

Minimal example:

```md
---
title: "Checkpoint Tuning Notes"
date: "2026-04-14"
excerpt: "Short summary for metadata and previews."
published: true
---

Your markdown starts here.
```

## Blog Rules

- Only markdown files inside `content/blogs` become blog posts.
- The filename controls the slug.
- The `date` field controls sort order on the site.
- Drafts stay hidden when `published: false`.
- There is no tags field anymore because the site does not use tags.

## Last Updated Behavior

- Site-wide timestamp: latest repo commit.
- Blog post timestamp: latest commit that touched that blog's markdown file.
- Lookup order:
  local `git log` first, then GitHub's commits API for `main`, then file modified time as a fallback if git metadata is unavailable.

Optional environment variables:

- `GIT_LAST_UPDATED_REPO`: overrides the GitHub repo used for the API fallback. Defaults to `nav-kulkarni/arnavkulkarni-site`.
- `GIT_LAST_UPDATED_REF`: overrides the branch/ref used for the API fallback. Defaults to `main`.
- `GITHUB_TOKEN`: optional, only needed for private repos or higher GitHub API limits.

## Useful Commands

```bash
npm run dev
npm run build
npm run lint
```
