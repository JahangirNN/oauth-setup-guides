import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

function SectionHeading({
  level,
  id,
  children,
}: {
  level: 2 | 3 | 4;
  id?: string;
  children?: ReactNode;
}) {
  const Tag = `h${level}` as const;

  return (
    <Tag id={id} className="scroll-mt-24">
      {children}
      {id ? (
        <a
          href={`#${id}`}
          className="heading-anchor"
          aria-label={`Link to ${id.replace(/-/g, " ")}`}
        >
          #
        </a>
      ) : null}
    </Tag>
  );
}

const components: Components = {
  h2({ id, children }) {
    return (
      <SectionHeading level={2} id={id}>
        {children}
      </SectionHeading>
    );
  },
  h3({ id, children }) {
    return (
      <SectionHeading level={3} id={id}>
        {children}
      </SectionHeading>
    );
  },
  h4({ id, children }) {
    return (
      <SectionHeading level={4} id={id}>
        {children}
      </SectionHeading>
    );
  },
  a({ href, children }) {
    const external = typeof href === "string" && /^https?:\/\//i.test(href);
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
      >
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="prose-table-wrap">
        <table>{children}</table>
      </div>
    );
  },
};

export function GuideMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="prose-guide">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={components}
        skipHtml
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
