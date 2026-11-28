import { profileIsStale } from '@salonstaff/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { ErrorBanner } from '@/components/state-views';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, errorMessage, type MyProfile } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/format';
import { useMyProfile } from '@/hooks/use-my-profile';
import { STRONG_PROFILE, strengthOfMyProfile } from '@/lib/profile-strength';

/** A bar filled to `score` out of 100. */
export function StrengthBar({ score }: { score: number }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.track, { backgroundColor: theme.surfaceMuted }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: score }}>
      <View style={[styles.fill, { backgroundColor: theme.brand, width: `${score}%` }]} />
    </View>
  );
}

/** "3d ago" for recent, "12 Aug 2026" for older. */
function updatedLabel(iso: string): string {
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  // In a sentence: "just now", not "Just now".
  return days < 30 ? timeAgo(iso).replace('Just now', 'just now') : formatDate(iso);
}

/**
 * The top of their profile (D-24): how complete it is, the most valuable thing to add next, the
 * rest of what's missing, and when it was last updated. Complete, it's one line.
 */
export function ProfileStrengthCard({ full }: { full: MyProfile }) {
  const theme = useTheme();
  const router = useRouter();
  const { score, todo } = strengthOfMyProfile(full);
  const [next, ...rest] = todo;
  const updated = `Last updated ${updatedLabel(full.profile.updatedAt)}`;

  if (!next) {
    return (
      <Card style={styles.complete}>
        <Icon name="done" size={22} color={theme.success} />
        <View style={styles.flex}>
          <Text variant="bodyStrong">Your profile is complete</Text>
          <Text variant="small" color="textMuted">
            {updated}
          </Text>
        </View>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <Text variant="subheading">Profile strength</Text>
        <Text variant="subheading" color="brand">
          {score}%
        </Text>
      </View>
      <StrengthBar score={score} />
      <Text variant="small" color="textSecondary">
        Salons look at complete profiles first. {updated}.
      </Text>
      <Button
        title={next.action}
        icon={next.icon}
        onPress={() => router.push(next.href)}
        style={styles.next}
      />
      {rest.length ? (
        <View style={[styles.list, { borderTopColor: theme.border }]}>
          {rest.map((t) => (
            <Pressable
              key={t.part}
              onPress={() => router.push(t.href)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
              <Icon name={t.icon} size={18} color={theme.textSecondary} />
              <Text style={styles.flex}>{t.action}</Text>
              <Text variant="smallStrong" color="textMuted">
                +{t.points}%
              </Text>
              <Icon name="chevronRight" size={12} color={theme.textMuted} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/**
 * After 90 days without a change (D-24): is it still right? "Yes, it's current" records that they
 * checked; "Update it" opens the basics.
 */
export function StaleProfileCard({
  full,
  onConfirmed,
}: {
  full: MyProfile;
  onConfirmed: (fresh: MyProfile) => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!profileIsStale(full.profile.updatedAt)) return null;

  async function confirm() {
    setError(null);
    setSaving(true);
    try {
      onConfirmed(await api.confirmProfileCurrent());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={[styles.card, { backgroundColor: theme.warningSoft, borderColor: theme.warningSoft }]}>
      <Text variant="subheading">
        {full.profile.openToWork ? 'Still looking?' : 'Is your profile up to date?'}
      </Text>
      <Text variant="small" color="textSecondary">
        You last updated your profile on {formatDate(full.profile.updatedAt)}. Check your roles,
        where you are and your photos are still right, so salons see the real you.
      </Text>
      <ErrorBanner message={error} />
      <View style={styles.buttons}>
        <Button title="Yes, it’s current" size="sm" loading={saving} onPress={confirm} />
        <Button
          title="Update it"
          size="sm"
          variant="outline"
          onPress={() => router.push('/edit-profile')}
        />
      </View>
    </Card>
  );
}

/**
 * A reminder to finish their profile while it's under `STRONG_PROFILE`% (D-24): on Jobs, and when
 * applying (where it says what the salon will see missing, without stopping them).
 */
export function ProfileNudge({ where }: { where: 'jobs' | 'apply' }) {
  const theme = useTheme();
  const router = useRouter();
  const { data } = useMyProfile();
  if (!data) return null;
  const { score, todo } = strengthOfMyProfile(data);
  if (score >= STRONG_PROFILE) return null;

  const missing = todo
    .slice(0, 3)
    .map((t) => t.action.toLowerCase())
    .join(', ');
  return (
    <Pressable
      onPress={() => router.push('/profile')}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.nudge,
        { backgroundColor: theme.brandSoft, opacity: pressed ? 0.8 : 1 },
      ]}>
      <View style={styles.flex}>
        <Text variant="smallStrong" color="brand">
          {where === 'apply'
            ? `The salon will see a profile that’s ${score}% complete`
            : `Your profile is ${score}% complete`}
        </Text>
        <Text variant="small" color="textSecondary">
          {where === 'apply'
            ? `You can still apply. To stand out: ${missing}.`
            : 'Finish it to stand out to salons.'}
        </Text>
      </View>
      <Icon name="chevronRight" size={14} color={theme.brand} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: Spacing.three },
  complete: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: { height: 8, borderRadius: Radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill },
  next: { marginTop: Spacing.one },
  list: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
});
