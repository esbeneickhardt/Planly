/**
 * Centralised localStorage keys. All accesses go through the helpers below
 * so a typo in a key name is a TypeScript error, not a silent null on read.
 */

export const STORAGE_KEYS = {
  theme: 'planly-theme',
  kanbanCompact: 'planly_kanban_compact',
  kanbanBg: (productId: string) => `planly-kanban-bg-${productId}`,
  kanbanSprint: (productId: string) => `planly_sprint_${productId}`,
  taskSidebar: 'planly-task-sidebar',
  taskSidebarWidth: 'planly-task-width',
  taskSidebarHeight: 'planly-task-height',
  taskSidebarPos: 'planly-task-pos',
  chatSidebar: 'planly-chat-sidebar',
  chatSidebarWidth: 'planly-chat-width',
  chatSidebarHeight: 'planly-chat-height',
  chatSidebarPos: 'planly-chat-pos',
  canvasView: (productId: string) => `planly-canvas-${productId}`,
  ganttHideDone: (productId: string) => `planly-gantt-hideDone-${productId}`,
  calendarUrl: (productId: string) => `planly-calendar-url-${productId}`,
} as const;

export function getStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore - quota exceeded or private browsing
  }
}

export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
