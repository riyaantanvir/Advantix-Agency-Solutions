import { useState, useEffect, useRef } from "react";
import { Copy, Check } from "lucide-react";

function useTypewriter(target: string, active: boolean): string {
  const [displayed, setDisplayed] = useState("");
  const posRef = useRef(0);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (!active) {
      setDisplayed(target);
      posRef.current = target.length;
      return;
    }
    posRef.current = 0;
    setDisplayed("");
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      const t = targetRef.current;
      if (posRef.current < t.length) {
        posRef.current += 1;
        setDisplayed(t.slice(0, posRef.current));
      }
    }, 12);
    return () => clearInterval(timer);
  }, [active]);

  return active ? displayed : target;
}

interface Props {
  content: string;
  isStreaming?: boolean;
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-border/60">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-border/40">
        <span className="text-[11px] text-muted-foreground font-mono">{language || "code"}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-xs leading-relaxed m-0 rounded-none bg-muted/30">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ImageResult({ b64_json, mimeType }: { b64_json: string; mimeType: string }) {
  const [downloading, setDownloading] = useState(false);

  function download() {
    setDownloading(true);
    const link = document.createElement("a");
    link.href = `data:${mimeType};base64,${b64_json}`;
    link.download = `advantix-ai-${Date.now()}.png`;
    link.click();
    setTimeout(() => setDownloading(false), 1000);
  }

  return (
    <div className="my-3">
      <img
        src={`data:${mimeType};base64,${b64_json}`}
        alt="Generated image"
        className="rounded-lg max-w-full w-full object-cover border border-border/40"
      />
      <button
        onClick={download}
        className="mt-2 text-xs text-primary hover:text-primary/80 transition-colors"
      >
        {downloading ? "Downloading..." : "↓ Download image"}
      </button>
    </div>
  );
}

export function MessageRenderer({ content, isStreaming }: Props) {
  const displayed = useTypewriter(content, !!isStreaming);

  // Handle image result
  if (content.startsWith("[IMAGE:")) {
    const match = content.match(/\[IMAGE:([^:]+):(.+)\]/s);
    if (match) {
      return <ImageResult mimeType={match[1]} b64_json={match[2]} />;
    }
  }

  // Parse markdown-like content with code blocks
  const parts: React.ReactNode[] = [];
  const renderContent = isStreaming ? displayed : content;
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(renderContent)) !== null) {
    // Text before code block
    if (match.index > lastIndex) {
      parts.push(
        <TextContent key={`text-${lastIndex}`} text={renderContent.slice(lastIndex, match.index)} />
      );
    }
    parts.push(
      <CodeBlock key={`code-${match.index}`} language={match[1]} code={match[2].trimEnd()} />
    );
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < renderContent.length) {
    parts.push(
      <TextContent
        key={`text-${lastIndex}`}
        text={renderContent.slice(lastIndex)}
        isStreaming={isStreaming}
      />
    );
  }

  if (parts.length === 0) {
    return <TextContent text={renderContent} isStreaming={isStreaming} />;
  }

  return <div>{parts}</div>;
}

function TextContent({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^#{1,3}\s/)) {
      const level = line.match(/^(#{1,3})\s/)![1].length;
      const headingText = line.replace(/^#{1,3}\s/, "");
      const cls = level === 1
        ? "text-base font-semibold mt-3 mb-1"
        : level === 2
        ? "text-sm font-semibold mt-2 mb-1"
        : "text-sm font-medium mt-1.5 mb-0.5";
      elements.push(<p key={i} className={cls}>{headingText}</p>);
    } else if (line.match(/^[-*•]\s/)) {
      elements.push(
        <div key={i} className="flex gap-2 text-sm leading-relaxed">
          <span className="text-muted-foreground mt-0.5 shrink-0">•</span>
          <span>{inlineFormat(line.replace(/^[-*•]\s/, ""))}</span>
        </div>
      );
    } else if (line.match(/^\d+\.\s/)) {
      const num = line.match(/^(\d+)\.\s/)![1];
      elements.push(
        <div key={i} className="flex gap-2 text-sm leading-relaxed">
          <span className="text-muted-foreground shrink-0 w-4 text-right">{num}.</span>
          <span>{inlineFormat(line.replace(/^\d+\.\s/, ""))}</span>
        </div>
      );
    } else if (line === "") {
      if (i > 0 && i < lines.length - 1) elements.push(<div key={i} className="h-1.5" />);
    } else {
      elements.push(
        <p key={i} className={`text-sm leading-relaxed ${i === lines.length - 1 && isStreaming ? "cursor-blink" : ""}`}>
          {inlineFormat(line)}
        </p>
      );
    }
  }

  return <div className="space-y-0.5">{elements}</div>;
}

function inlineFormat(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("`")) {
      parts.push(<code key={m.index} className="font-mono text-xs bg-muted/80 px-1 py-0.5 rounded text-primary/90">{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      parts.push(<strong key={m.index} className="font-semibold">{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={m.index}>{token.slice(1, -1)}</em>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
