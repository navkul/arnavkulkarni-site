'use client';

import { useEffect, useRef } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-bash';

interface BlogPostContentProps {
  html: string;
}

export function BlogPostContent({ html }: BlogPostContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      Prism.highlightAllUnder(contentRef.current);
    }
  }, [html]);

  return (
    <div
      ref={contentRef}
      className="blog-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default BlogPostContent;
