/**
 * Shared between SearchModal.tsx and its result-section components under this directory.
 */
export type NavItem = {
  label: string;
  subtitle: string;
  /** Only used as a React key and as the destination when `action` is absent - personal/profile
   * items that open a modal instead of navigating use a unique `#`-prefixed placeholder here. */
  path: string;
  icon: string;
  keywords: string[];
  /** When present, runs instead of `navigate(path)` - used for items that open a modal
   * (personal settings, chat) or need to do something before navigating (create new task). */
  action?: () => void;
};

export type TabFilter = 'all' | 'tasks' | 'messages' | 'settings' | 'projects';

/** Returns true for settings/admin nav items so they can be separated into the Settings tab. */
export function isSettingsNav(item: NavItem): boolean {
  return item.label.startsWith('Settings') || item.label.startsWith('Profile') || item.label === 'Admin Panel';
}
