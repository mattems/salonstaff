import { useRouter } from 'expo-router';

import { EmptyView } from '@/components/state-views';
import { useAuth } from '@/lib/auth';

/** Shown on a profile section before there's a profile to add to. */
export function NeedsProfile() {
  const router = useRouter();
  return (
    <EmptyView
      icon="edit"
      title="Set up your profile first"
      body="Your name, where you are and the roles you're after. Then you can add the rest."
      actionLabel="Set up profile"
      onAction={() => router.push('/edit-profile')}
    />
  );
}

/** A profile section screen: shows `NeedsProfile` until there is a profile, then the section. */
export function profileSection(Section: () => React.ReactNode) {
  return function ProfileSection() {
    const { user } = useAuth();
    return user?.profile ? <Section /> : <NeedsProfile />;
  };
}
