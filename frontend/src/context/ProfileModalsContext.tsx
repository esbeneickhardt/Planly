/**
 * Thin context exposing the personal/profile modals' open state (theme, memberships, integrations,
 * notification preferences, privacy, security/2FA, change password). The actual `useState` calls
 * and modal rendering still live in TopBar - this just lets other components (like SearchModal,
 * a sibling of TopBar under AppLayout) open them too, the same way ChatContext lets any component
 * open the chat panel.
 */
import { createContext, useContext } from 'react';

export type ProfileModalKey =
  | 'theme'
  | 'memberships'
  | 'integrations'
  | 'notifications'
  | 'privacy'
  | 'security'
  | 'changePassword';

interface ProfileModalsContextValue {
  showThemePicker: boolean;
  setShowThemePicker: (v: boolean) => void;
  showMemberships: boolean;
  setShowMemberships: (v: boolean) => void;
  showIntegrations: boolean;
  setShowIntegrations: (v: boolean) => void;
  showNotifPrefs: boolean;
  setShowNotifPrefs: (v: boolean) => void;
  showPrivacy: boolean;
  setShowPrivacy: (v: boolean) => void;
  showTotp: boolean;
  setShowTotp: (v: boolean) => void;
  showChangePassword: boolean;
  setShowChangePassword: (v: boolean) => void;
  /** Convenience for callers that just want to open one by name, e.g. from search results */
  openProfileModal: (key: ProfileModalKey) => void;
}

const noop = () => {};

export const ProfileModalsContext = createContext<ProfileModalsContextValue>({
  showThemePicker: false,
  setShowThemePicker: noop,
  showMemberships: false,
  setShowMemberships: noop,
  showIntegrations: false,
  setShowIntegrations: noop,
  showNotifPrefs: false,
  setShowNotifPrefs: noop,
  showPrivacy: false,
  setShowPrivacy: noop,
  showTotp: false,
  setShowTotp: noop,
  showChangePassword: false,
  setShowChangePassword: noop,
  openProfileModal: noop,
});

export function useProfileModals() {
  return useContext(ProfileModalsContext);
}
