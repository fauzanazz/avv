import { Streamdown, type Components, type StreamdownProps } from "streamdown";
import { code } from "@streamdown/code";

const plugins = { code };
const shikiTheme: StreamdownProps["shikiTheme"] = ["catppuccin-mocha", "catppuccin-mocha"];

const components: Components = {
  h1: ({ children, node, ...props }) => (
    <h1 className="text-xl font-bold mb-3 mt-4 text-[var(--text-primary)]" {...props}>{children}</h1>
  ),
  h2: ({ children, node, ...props }) => (
    <h2 className="text-lg font-semibold mb-2 mt-3 text-[var(--text-primary)]" {...props}>{children}</h2>
  ),
  h3: ({ children, node, ...props }) => (
    <h3 className="text-base font-medium mb-2 mt-2 text-[var(--text-primary)]" {...props}>{children}</h3>
  ),
  p: ({ children, node, ...props }) => (
    <p className="leading-relaxed mb-3 last:mb-0" {...props}>{children}</p>
  ),
  a: ({ children, href, node, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--accent-primary)] hover:underline"
      {...props}
    >
      {children}
    </a>
  ),
  code: ({ children, className, node, ...props }) => {
    const isInline = !className?.includes("language-");
    if (isInline) {
      return (
        <code
          className="bg-[var(--bg-surface)] text-[var(--accent-primary)] px-1.5 py-0.5 rounded text-[13px]"
          {...props}
        >
          {children}
        </code>
      );
    }
    return <code className={className} {...props}>{children}</code>;
  },
  pre: ({ children, node, ...props }) => (
    <pre
      className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg p-4 overflow-x-auto my-3 text-[13px]"
      {...props}
    >
      {children}
    </pre>
  ),
  ul: ({ children, node, ...props }) => (
    <ul className="list-disc list-outside ml-5 space-y-1 mb-3" {...props}>{children}</ul>
  ),
  ol: ({ children, node, ...props }) => (
    <ol className="list-decimal list-outside ml-5 space-y-1 mb-3" {...props}>{children}</ol>
  ),
  li: ({ children, node, ...props }) => (
    <li className="leading-relaxed" {...props}>{children}</li>
  ),
  blockquote: ({ children, node, ...props }) => (
    <blockquote
      className="border-l-2 border-[var(--accent-primary)] pl-4 text-[var(--text-secondary)] italic my-3"
      {...props}
    >
      {children}
    </blockquote>
  ),
  hr: ({ node, ...props }) => (
    <hr className="border-[var(--border-subtle)] my-4" {...props} />
  ),
  table: ({ children, node, ...props }) => (
    <div className="overflow-x-auto my-3">
      <table className="min-w-full text-sm" {...props}>{children}</table>
    </div>
  ),
  th: ({ children, node, ...props }) => (
    <th className="border border-[var(--border-subtle)] px-3 py-1.5 bg-[var(--bg-elevated)] text-left text-[var(--text-secondary)] font-medium" {...props}>{children}</th>
  ),
  td: ({ children, node, ...props }) => (
    <td className="border border-[var(--border-subtle)] px-3 py-1.5" {...props}>{children}</td>
  ),
};

interface MarkdownContentProps {
  content: string;
  isStreaming?: boolean;
}

export function MarkdownContent({ content, isStreaming }: MarkdownContentProps) {
  if (!content) return null;

  return (
    <div className="text-sm text-[var(--text-primary)] leading-relaxed">
      <Streamdown
        plugins={plugins}
        components={components}
        shikiTheme={shikiTheme}
        isAnimating={isStreaming}
        caret={isStreaming ? "block" : undefined}
        {...(!isStreaming ? { mode: "static" as const } : {})}
      >
        {content}
      </Streamdown>
    </div>
  );
}
