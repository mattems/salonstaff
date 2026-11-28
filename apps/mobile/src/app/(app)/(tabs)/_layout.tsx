import { NativeTabs } from 'expo-router/native-tabs';

import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useMode } from '@/lib/mode';

const badge = (n: number) => (n > 99 ? '99+' : String(n));

/**
 * The system tab bar (iOS's own, with its glass and badges). A job seeker's tabs, or on the salon
 * side (D-20) the salon's: its jobs, applicants, messages and your account. Switching sides
 * remounts the tabs, starting on the first.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const { user } = useAuth();
  const { mode, salonUnread } = useMode();
  const seeker = mode === 'seeker';
  const unread = user?.unreadMessages ?? 0;
  return (
    <NativeTabs tintColor={theme.brand} badgeBackgroundColor={theme.brand}>
      <NativeTabs.Trigger name="(jobs)" hidden={!seeker}>
        <NativeTabs.Trigger.Icon sf={{ default: 'briefcase', selected: 'briefcase.fill' }} md="work" />
        <NativeTabs.Trigger.Label>Jobs</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(saved)" hidden={!seeker}>
        <NativeTabs.Trigger.Icon sf={{ default: 'bookmark', selected: 'bookmark.fill' }} md="bookmark" />
        <NativeTabs.Trigger.Label>Saved</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(applications)" hidden={!seeker}>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'doc.text', selected: 'doc.text.fill' }}
          md="description"
        />
        <NativeTabs.Trigger.Label>Applications</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(inbox)" hidden={!seeker}>
        <NativeTabs.Trigger.Icon sf={{ default: 'tray', selected: 'tray.fill' }} md="inbox" />
        <NativeTabs.Trigger.Label>Inbox</NativeTabs.Trigger.Label>
        {unread > 0 ? <NativeTabs.Trigger.Badge>{badge(unread)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(profile)" hidden={!seeker}>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md="person"
        />
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(hiring)" hidden={seeker}>
        <NativeTabs.Trigger.Icon sf={{ default: 'briefcase', selected: 'briefcase.fill' }} md="work" />
        <NativeTabs.Trigger.Label>Jobs</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(applicants)" hidden={seeker}>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} md="group" />
        <NativeTabs.Trigger.Label>Applicants</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(messages)" hidden={seeker}>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }}
          md="chat"
        />
        <NativeTabs.Trigger.Label>Messages</NativeTabs.Trigger.Label>
        {salonUnread > 0 ? (
          <NativeTabs.Trigger.Badge>{badge(salonUnread)}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(salon)" hidden={seeker}>
        <NativeTabs.Trigger.Icon sf={{ default: 'storefront', selected: 'storefront.fill' }} md="store" />
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
