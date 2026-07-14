/**
 * XSS security tests for MessageBubble.
 *
 * ReactMarkdown (without rehype-raw) does not render raw HTML strings -
 * it escapes them as text. These tests confirm that attacker-controlled
 * message content cannot inject script elements or event handler attributes
 * into the DOM.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MessageBubble from '../../components/common/MessageBubble';
import type { Message } from '../../api/client';

function makeMsg(content: string): Message {
  return {
    id: 'msg-1',
    productId: 'prod-1',
    taskId: null,
    authorId: 'u-1',
    content,
    attachments: [],
    createdAt: new Date().toISOString(),
    editedAt: null,
    reactions: [],
    author: { id: 'u-1', username: 'alice', realName: null, avatarEmoji: null },
  };
}

const noop = vi.fn();

function renderBubble(content: string) {
  return render(
    <MessageBubble
      msg={makeMsg(content)}
      isOwn={false}
      onEdit={noop}
      onDelete={noop}
      onImageClick={noop}
      onReact={noop}
      onToggleReactionPicker={noop}
      canEdit={false}
      currentUserId={null}
      reactionPickerOpen={false}
    />,
  );
}

describe('MessageBubble - XSS safety', () => {
  it('does not inject <script> tags from message content', () => {
    const { container } = renderBubble('<script>window.__xss=1</script>');
    expect(container.querySelectorAll('script')).toHaveLength(0);
    expect((window as unknown as Record<string, unknown>).__xss).toBeUndefined();
  });

  it('does not inject onerror on <img> tags', () => {
    const { container } = renderBubble('<img src=x onerror="window.__xss2=1">');
    // ReactMarkdown without rehype-raw won't render the img element with onerror
    const imgs = container.querySelectorAll('img');
    imgs.forEach((img) => {
      expect(img.getAttribute('onerror')).toBeNull();
    });
    expect((window as unknown as Record<string, unknown>).__xss2).toBeUndefined();
  });

  it('does not execute javascript: href in links', () => {
    renderBubble('[click me](javascript:window.__xss3=1)');
    // Links should either not render or have href sanitized
    const links = document.querySelectorAll('a');
    links.forEach((a) => {
      expect(a.href).not.toMatch(/^javascript:/);
    });
  });

  it('renders safe markdown normally', () => {
    renderBubble('**hello** _world_');
    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.getByText('world')).toBeTruthy();
  });

  it('renders code blocks without executing them', () => {
    const { container } = renderBubble('```js\nconsole.log("test")\n```');
    // rehype-highlight splits the code into spans; check the container text content
    expect(container.querySelector('pre code')?.textContent).toMatch(/console\.log/);
  });
});
