---
title: "Blog authoring guide"
date: "1970-01-01"
published: false
---

Required frontmatter

- **title**: Post title (string)
- **date**: Publication date as an ISO date string. Use "YYYY-MM-DD" (e.g., "2025-10-31").

Optional frontmatter

- **excerpt**: One-line summary (string)
- **tags**: List of tags (array of strings)
- **published**: Boolean, defaults to true. Set to false to hide drafts.

Filename and slug

- The filename (without `.md`) becomes the slug. For `2025-10-31-hello.md`, the slug is `2025-10-31-hello`.
- You can name files however you like; including a date prefix is recommended but not required. Sorting is based on the `date` field in frontmatter, not the filename.

Minimal template

```md
---
title: "My Post Title"
date: "2025-10-31"  
excerpt: "One line overview."
tags: ["distributed-systems", "notes"]
published: true
---

Your markdown content starts here.
```

Troubleshooting

- **RangeError: Invalid time value**: This means the `date` frontmatter is missing or not a valid ISO date. Ensure it is present and formatted like `YYYY-MM-DD`.
- Drafts: If `published: false`, the post won’t appear in listings.

