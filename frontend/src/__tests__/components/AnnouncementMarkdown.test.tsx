/**
 * XSS security tests for announcement content rendering.
 *
 * AnnouncementsPage renders user-authored content via ReactMarkdown with
 * remarkGfm. These tests verify that the rendering pipeline blocks common
 * HTML injection attacks, matching the same plugin configuration used in
 * the page (no rehype-raw, no rehype-sanitize needed because raw HTML is
 * not allowed by default).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Minimal MD component map - mirrors the subset from AnnouncementsPage that
// is relevant to XSS: link and image rendering.
const MD = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  a: ({ children, href }: any) => (
    <a href={href} target="_blank" rel="noreferrer" data-testid="md-link">
      {children}
    </a>
  ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  img: ({ src, alt }: any) => (
    <img src={src} alt={alt} data-testid="md-img" style={{ maxWidth: '100%' }} />
  ),
};

function renderMd(content: string) {
  return render(
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
      {content}
    </ReactMarkdown>,
  );
}

describe('Announcement markdown - XSS safety', () => {
  // ReactMarkdown without rehype-raw strips raw HTML; script injection must not execute
  it('does not render raw <script> tags', () => {
    const { container } = renderMd('<script>window.__ann_xss=1</script>');
    expect(container.querySelectorAll('script')).toHaveLength(0);
    expect((window as unknown as Record<string, unknown>).__ann_xss).toBeUndefined();
  });

  // onerror on img is the classic XSS vector when raw HTML is allowed; must be stripped
  it('does not render <img> with onerror handler', () => {
    const { container } = renderMd('<img src=x onerror="window.__ann_xss2=1">');
    const imgs = container.querySelectorAll('img');
    imgs.forEach((img) => {
      expect(img.getAttribute('onerror')).toBeNull();
    });
    expect((window as unknown as Record<string, unknown>).__ann_xss2).toBeUndefined();
  });

  // javascript: hrefs execute code on click; must be blocked even when the link text is safe
  it('does not allow javascript: in anchor href', () => {
    renderMd('[click](javascript:window.__ann_xss3=1)');
    const links = document.querySelectorAll('[data-testid="md-link"]');
    links.forEach((a) => {
      expect(a.getAttribute('href')).not.toMatch(/^javascript:/i);
    });
    expect((window as unknown as Record<string, unknown>).__ann_xss3).toBeUndefined();
  });

  // Iframes can load arbitrary external content and bypass CSP; must be suppressed
  it('does not render <iframe> embeds', () => {
    const { container } = renderMd('<iframe src="https://evil.com"></iframe>');
    expect(container.querySelectorAll('iframe')).toHaveLength(0);
  });

  // Forms with an action URL can be used for phishing; must not appear in rendered output
  it('does not render <form> with action', () => {
    const { container } = renderMd('<form action="https://evil.com"><input name="csrf"></form>');
    expect(container.querySelectorAll('form')).toHaveLength(0);
  });

  // Sanity check: the security measures must not break legitimate GFM formatting
  it('renders safe GFM content normally', () => {
    renderMd('**Bold** _italic_ ~~strike~~\n\n| Col |\n|---|\n| val |');
    expect(screen.getByText('Bold')).toBeTruthy();
    expect(screen.getByText('italic')).toBeTruthy();
    expect(screen.getByText('val')).toBeTruthy();
  });

  // MD-syntax images (not raw HTML) must render via our custom img component
  it('renders markdown image tags via the img component', () => {
    const { container } = renderMd('![alt text](https://example.com/img.png)');
    const imgs = container.querySelectorAll('[data-testid="md-img"]');
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs[0]!.getAttribute('src')).toBe('https://example.com/img.png');
  });
});
