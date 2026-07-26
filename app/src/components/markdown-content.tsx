"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-6 mb-3 text-lg font-bold tracking-tight text-foreground first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2 text-base font-semibold text-foreground/90">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-2 text-sm font-semibold text-foreground/80">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-sm leading-relaxed text-foreground/90 last:mb-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 space-y-1.5 pl-1 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 space-y-1.5 pl-1 list-decimal list-inside last:mb-0">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-sm leading-relaxed text-foreground/85 flex gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400/60" />
      <span>{children}</span>
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="text-foreground/80 italic">{children}</em>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-orange-500/30 pl-4 text-foreground/80 italic">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="block mb-3 rounded-xl bg-foreground/[0.03] border border-border/40 p-4 text-xs font-mono text-foreground/80 overflow-x-auto">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-xs font-mono text-orange-600 dark:text-orange-300">
        {children}
      </code>
    );
  },
  hr: () => (
    <hr className="my-5 border-border/30" />
  ),
};

interface MarkdownContentProps {
  content: string;
  variant?: "analysis" | "concepts";
}

export function MarkdownContent({ content, variant = "analysis" }: MarkdownContentProps) {
  if (!content) {
    return (
      <p className="text-sm text-muted-foreground italic">No content available.</p>
    );
  }

  const accentColor = variant === "analysis" ? "orange" : "orange";

  return (
    <div className={`prose-custom accent-${accentColor}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
