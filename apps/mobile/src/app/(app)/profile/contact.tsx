import { CONTACT_BY, type ContactBy } from '@salonstaff/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { profileSection } from '@/components/needs-profile';
import { RadioList } from '@/components/radio-list';
import { Screen } from '@/components/screen';
import { ErrorBanner, ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { useMyProfile } from '@/hooks/use-my-profile';
import { api, errorMessage } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { formatAuMobile } from '@/lib/format';

const DESCRIPTIONS: Record<ContactBy, string> = {
  both: 'Salons can send you a message and see your mobile.',
  email:
    'Salons send you a message, which we email to you. They don’t see your address until you reply.',
  phone: 'Salons can see your mobile and call or text you.',
};

export default profileSection(ContactScreen);

function ContactScreen() {
  const router = useRouter();
  const user = useUser();
  const { data, error, loading, reload, setData } = useMyProfile();
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return null;

  /** What the account lacks for an option: an email, a mobile, or both. */
  const needs = (value: ContactBy) =>
    [value !== 'phone' && !user.email && 'an email', value !== 'email' && !user.phoneNumber && 'a mobile'].filter(
      Boolean,
    );

  const options = CONTACT_BY.map((option) => {
    const missing = needs(option.value);
    return {
      value: option.value,
      label: option.label,
      disabled: missing.length > 0,
      description: missing.length
        ? `Add ${missing.join(' and ')} to your account first.`
        : DESCRIPTIONS[option.value],
    };
  });

  async function choose(contactBy: ContactBy) {
    if (!data || contactBy === data.settings.contactBy || saving) return;
    setProblem(null);
    setSaving(true);
    try {
      const settings = await api.saveSettings({ contactBy });
      setData((prev) => (prev ? { ...prev, settings } : prev));
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Text variant="small" color="textSecondary">
        Only people signed in on a salon’s team can contact you, and only if they can see your
        profile.
      </Text>
      <RadioList options={options} value={data.settings.contactBy} onChange={choose} />
      <ErrorBanner message={problem} />
      <Text variant="small" color="textSecondary">
        Messages go to <Text variant="smallStrong">{user.email ?? 'no email yet'}</Text>; salons who
        look see{' '}
        <Text variant="smallStrong">
          {user.phoneNumber ? formatAuMobile(user.phoneNumber) : 'no mobile yet'}
        </Text>
        .
      </Text>
      <Button
        title="Change your email or mobile"
        variant="outline"
        size="sm"
        onPress={() => router.push('/profile/security')}
      />
      <Button title="Open your inbox" variant="ghost" size="sm" onPress={() => router.push('/inbox')} />
    </Screen>
  );
}
