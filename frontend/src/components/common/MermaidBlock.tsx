/**
 * Shared mermaid diagram renderer used by all markdown-rendering components.
 *
 * Renders a ```mermaid fenced code block as an SVG diagram by calling the
 * mermaid.render() API client-side. Theme is detected from the data-theme
 * attribute on <html> (toggled by the light/dark switch) or from the
 * prefers-color-scheme media query as a fallback.
 *
 * Invalid diagram syntax shows the mermaid error message in-place rather
 * than throwing.
 */
import { useEffect, useRef, useState, useId } from 'react';
import mermaid from 'mermaid';

export function MermaidBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // useId provides a stable unique value per component instance; colons stripped because mermaid uses it as an HTML element id
  const rawId = useId().replace(/:/g, '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    setError(null);
    const isDark =
      document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.hasAttribute('data-theme') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      securityLevel: 'loose',
    });
    mermaid
      .render(`mermaid-${rawId}`, code)
      .then(({ svg }) => {
        if (containerRef.current) containerRef.current.innerHTML = svg;
      })
      .catch((e) => setError(String(e)));
  }, [code, rawId]);

  if (error) {
    return (
      <pre
        style={{
          background: 'var(--surface)',
          borderRadius: 6,
          padding: '8px 10px',
          fontSize: 12,
          color: '#ef4444',
          margin: '8px 0',
        }}
      >
        {error}
      </pre>
    );
  }
  return <div ref={containerRef} style={{ margin: '8px 0', overflowX: 'auto' }} />;
}
