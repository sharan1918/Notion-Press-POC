import React from "react";

interface Props {
  content: string;
  className?: string;
  inline?: boolean;
}

/**
 * Parses inline markdown tokens:
 * - **bold** or __bold__
 * - *italic* or _italic_
 * - `code`
 * - [text](url)
 */
export function renderInline(text: string): React.ReactNode[] {
  const inlineRegex = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*([^*]+)\*|_([^_]+)_)/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }

    const fullMatch = match[0];

    if (fullMatch.startsWith("**") && fullMatch.endsWith("**")) {
      elements.push(
        <strong key={`b-${match.index}`} className="font-semibold text-foreground">
          {match[2]}
        </strong>
      );
    } else if (fullMatch.startsWith("__") && fullMatch.endsWith("__")) {
      elements.push(
        <strong key={`b2-${match.index}`} className="font-semibold text-foreground">
          {match[3]}
        </strong>
      );
    } else if (fullMatch.startsWith("`") && fullMatch.endsWith("`")) {
      elements.push(
        <code
          key={`c-${match.index}`}
          className="bg-secondary/70 border border-border/50 text-foreground px-1.5 py-0.5 rounded text-[11px] font-mono"
        >
          {match[4]}
        </code>
      );
    } else if (fullMatch.startsWith("[") && fullMatch.includes("](")) {
      elements.push(
        <a
          key={`a-${match.index}`}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:text-primary/80 transition-colors"
        >
          {match[5]}
        </a>
      );
    } else if ((fullMatch.startsWith("*") && fullMatch.endsWith("*")) || (fullMatch.startsWith("_") && fullMatch.endsWith("_"))) {
      elements.push(
        <em key={`i-${match.index}`} className="italic">
          {match[7] || match[8]}
        </em>
      );
    }

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements.length > 0 ? elements : [text];
}

interface Block {
  type: "heading" | "bold-header" | "ul" | "ol" | "paragraph" | "quote" | "signoff";
  level?: number;
  items?: string[];
  content?: string;
  startNumber?: number;
}

export default function FormattedText({ content, className = "", inline = false }: Props) {
  if (!content) return null;

  if (inline) {
    return <span className={className}>{renderInline(content)}</span>;
  }

  const rawLines = content.split(/\r?\n/);
  const blocks: Block[] = [];
  let currentUl: string[] | null = null;
  let currentOl: { items: string[]; start: number } | null = null;
  let currentPara: string[] = [];

  const flushList = () => {
    if (currentUl && currentUl.length > 0) {
      blocks.push({ type: "ul", items: [...currentUl] });
      currentUl = null;
    }
    if (currentOl && currentOl.items.length > 0) {
      blocks.push({ type: "ol", items: [...currentOl.items], startNumber: currentOl.start });
      currentOl = null;
    }
  };

  const flushPara = () => {
    if (currentPara.length > 0) {
      const fullText = currentPara.join("\n").trim();
      if (fullText) {
        const lower = fullText.toLowerCase();
        if (
          lower.startsWith("warm regards,") ||
          lower.startsWith("best regards,") ||
          lower.startsWith("regards,") ||
          lower.startsWith("thanks,") ||
          lower.startsWith("sincerely,")
        ) {
          blocks.push({ type: "signoff", content: fullText });
        } else {
          blocks.push({ type: "paragraph", content: fullText });
        }
      }
      currentPara = [];
    }
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      flushPara();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      flushPara();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        content: headingMatch[2],
      });
      continue;
    }

    const boldHeaderMatch = trimmed.match(/^\*\*([^*]+)\*\*$/);
    if (boldHeaderMatch) {
      flushList();
      flushPara();
      blocks.push({
        type: "bold-header",
        content: boldHeaderMatch[1],
      });
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushList();
      flushPara();
      blocks.push({
        type: "quote",
        content: trimmed.replace(/^>\s*/, ""),
      });
      continue;
    }

    const ulMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (ulMatch) {
      flushPara();
      if (!currentUl) {
        flushList();
        currentUl = [];
      }
      currentUl.push(ulMatch[1]);
      continue;
    }

    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      flushPara();
      const num = parseInt(olMatch[1], 10);
      if (!currentOl) {
        flushList();
        currentOl = { items: [], start: num };
      }
      currentOl.items.push(olMatch[2]);
      continue;
    }

    flushList();
    currentPara.push(line);
  }

  flushList();
  flushPara();

  return (
    <div className={`space-y-3 font-sans text-[13px] sm:text-sm text-foreground/90 leading-relaxed ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case "heading":
            if (block.level === 1) {
              return (
                <h3 key={idx} className="text-sm sm:text-base font-semibold text-foreground mt-4 mb-1">
                  {renderInline(block.content || "")}
                </h3>
              );
            }
            return (
              <h4 key={idx} className="text-[13px] sm:text-sm font-semibold text-foreground mt-3 mb-1">
                {renderInline(block.content || "")}
              </h4>
            );

          case "bold-header":
            return (
              <p key={idx} className="font-semibold text-foreground text-[13px] sm:text-sm pt-2 mb-0.5">
                {renderInline(block.content || "")}
              </p>
            );

          case "quote":
            return (
              <blockquote
                key={idx}
                className="border-l-2 border-border pl-3 py-1 my-2 text-muted-foreground italic"
              >
                {renderInline(block.content || "")}
              </blockquote>
            );

          case "ul":
            return (
              <ul key={idx} className="list-disc pl-5 space-y-1.5 my-2 marker:text-muted-foreground/70">
                {block.items?.map((item, itemIdx) => (
                  <li key={itemIdx} className="pl-0.5 text-foreground/90">
                    {renderInline(item)}
                  </li>
                ))}
              </ul>
            );

          case "ol":
            return (
              <ol
                key={idx}
                start={block.startNumber || 1}
                className="list-decimal pl-5 space-y-1.5 my-2 marker:text-muted-foreground/80 marker:font-medium"
              >
                {block.items?.map((item, itemIdx) => (
                  <li key={itemIdx} className="pl-0.5 text-foreground/90">
                    {renderInline(item)}
                  </li>
                ))}
              </ol>
            );

          case "signoff":
            return (
              <div key={idx} className="pt-2 mt-3 text-foreground/90 space-y-0.5">
                {block.content?.split("\n").map((line, lineIdx) => (
                  <div key={lineIdx} className={lineIdx === 0 ? "font-normal" : "font-medium text-foreground"}>
                    {renderInline(line)}
                  </div>
                ))}
              </div>
            );

          case "paragraph":
          default:
            return (
              <p key={idx} className="text-[13px] sm:text-sm text-foreground/90 leading-relaxed my-1.5">
                {renderInline(block.content || "")}
              </p>
            );
        }
      })}
    </div>
  );
}
