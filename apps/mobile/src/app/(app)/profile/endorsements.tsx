import {
  CONTACT_LIMITS,
  ENDORSEMENT_RELATIONSHIPS,
  endorsementRequestSchema,
  labelFor,
  PROFILE_LIMITS,
} from '@salonstaff/shared';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { profileSection } from '@/components/needs-profile';
import { Pill, type Tone } from '@/components/pill';
import { Screen } from '@/components/screen';
import { ErrorBanner, ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { ApiProblem, api, errorMessage, type MyEndorsement } from '@/lib/api';
import { formatDate } from '@/lib/format';

const STATUS: Record<MyEndorsement['status'], { label: string; tone: Tone }> = {
  requested: { label: 'Waiting for them', tone: 'neutral' },
  received: { label: 'New: show it?', tone: 'brand' },
  shown: { label: 'On your profile', tone: 'success' },
  hidden: { label: 'Hidden', tone: 'neutral' },
};

export default profileSection(EndorsementsScreen);

function EndorsementsScreen() {
  const { data, error, loading, refreshing, reload, refresh } = useRequest(api.endorsements, {
    refetchOnFocus: true,
  });
  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return null;
  const written = data.items.filter((e) => e.status !== 'requested');
  const waiting = data.items.filter((e) => e.status === 'requested');

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Ask onSent={reload} />
      <Card>
        <Text variant="subheading">Your endorsements</Text>
        <Text variant="small" color="textSecondary">
          Choose which to show on your profile, up to {PROFILE_LIMITS.endorsements}. You can’t change
          what someone wrote.
        </Text>
        {written.length ? (
          written.map((item) => <Written key={item.id} item={item} onChange={reload} />)
        ) : (
          <Text variant="small" color="textMuted">
            None written yet.
          </Text>
        )}
      </Card>
      {waiting.length ? (
        <Card>
          <Text variant="subheading">Waiting for an answer</Text>
          {waiting.map((item) => (
            <Waiting key={item.id} item={item} onChange={reload} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function Ask({ onSent }: { onSent: () => Promise<void> }) {
  const [form, setForm] = useState({ refereeName: '', refereeEmail: '', note: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function send() {
    setProblem(null);
    setNotice(null);
    const parsed = endorsementRequestSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSending(true);
    try {
      await api.askForEndorsement(parsed.data);
      setForm({ refereeName: '', refereeEmail: '', note: '' });
      setNotice(`Sent to ${parsed.data.refereeEmail}`);
      await onSent();
    } catch (err) {
      if (err instanceof ApiProblem && err.errors.length) {
        setErrors(Object.fromEntries(err.errors.map((e) => [e.path, e.message])));
      }
      setProblem(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <Text variant="subheading">Ask for an endorsement</Text>
      <Text variant="small" color="textSecondary">
        Someone you’ve worked with: a salon owner, manager, colleague or educator. We email them a
        link to write a few words about you. It works once.
      </Text>
      <TextField label="Their name" value={form.refereeName} onChangeText={set('refereeName')} error={errors.refereeName} />
      <TextField
        label="Their email"
        value={form.refereeEmail}
        onChangeText={set('refereeEmail')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        error={errors.refereeEmail}
      />
      <TextField
        label="A note to them (optional)"
        value={form.note}
        onChangeText={set('note')}
        multiline
        maxLength={300}
        placeholder="Would you mind writing a few words about our time at…"
        error={errors.note}
      />
      <ErrorBanner message={problem} />
      {notice ? (
        <Text variant="small" color="success">
          {notice}
        </Text>
      ) : null}
      <Button title="Send request" onPress={send} loading={sending} variant="secondary" />
      <Text variant="caption" color="textMuted">
        Endorsements from someone on a salon’s team here are marked as such. Ask at their own
        address, not yours. Up to {CONTACT_LIMITS.endorsementRequestsPerDay} a day.
      </Text>
    </Card>
  );
}

function useItemAction(onChange: () => Promise<void>) {
  const [pending, setPending] = useState(false);
  return {
    pending,
    run: async (work: () => Promise<unknown>) => {
      setPending(true);
      try {
        await work();
        await onChange();
      } catch (err) {
        Alert.alert('Something went wrong', errorMessage(err));
      } finally {
        setPending(false);
      }
    },
  };
}

function Written({ item, onChange }: { item: MyEndorsement; onChange: () => Promise<void> }) {
  const theme = useTheme();
  const { pending, run } = useItemAction(onChange);
  const status = STATUS[item.status];
  const meta = [
    item.refereeTitle,
    item.salonName,
    item.relationship && labelFor(ENDORSEMENT_RELATIONSHIPS, item.relationship),
    item.writtenAt && formatDate(item.writtenAt),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.item, { borderColor: theme.border }]}>
      <View style={styles.pills}>
        <Text variant="bodyStrong">{item.refereeName}</Text>
        <Pill label={status.label} tone={status.tone} />
        {item.onSalonStaff ? <Pill label="On Salon Staff" tone="info" /> : null}
      </View>
      {meta ? (
        <Text variant="small" color="textSecondary">
          {meta}
        </Text>
      ) : null}
      <View style={[styles.quote, { borderLeftColor: theme.brand }]}>
        <Text variant="small">{item.body}</Text>
      </View>
      {item.contactOk ? (
        <Text variant="caption" color="textMuted">
          Happy for salons you apply to to contact them.
        </Text>
      ) : null}
      <View style={styles.buttons}>
        {item.status === 'shown' ? (
          <Button
            title="Hide"
            size="sm"
            variant="outline"
            disabled={pending}
            onPress={() => run(() => api.showEndorsement(item.id, false))}
          />
        ) : (
          <Button
            title="Show on my profile"
            size="sm"
            disabled={pending}
            onPress={() => run(() => api.showEndorsement(item.id, true))}
          />
        )}
        <Button
          title="Delete"
          size="sm"
          variant="ghost"
          disabled={pending}
          onPress={() =>
            Alert.alert('Delete this endorsement?', 'You can’t get it back.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => run(() => api.removeEndorsement(item.id)),
              },
            ])
          }
        />
      </View>
    </View>
  );
}

function Waiting({ item, onChange }: { item: MyEndorsement; onChange: () => Promise<void> }) {
  const theme = useTheme();
  const { pending, run } = useItemAction(onChange);
  return (
    <View style={[styles.item, styles.waiting, { borderColor: theme.border }]}>
      <View style={styles.flex}>
        <Text variant="bodyStrong">{item.refereeName}</Text>
        <Text variant="small" color="textSecondary">
          {item.refereeEmail} · asked {formatDate(item.createdAt)}
          {item.linkExpiresAt ? `, link works until ${formatDate(item.linkExpiresAt)}` : ''}
        </Text>
      </View>
      <Button
        title="Cancel"
        size="sm"
        variant="outline"
        disabled={pending}
        onPress={() => run(() => api.removeEndorsement(item.id))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  item: { gap: Spacing.two, paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  pills: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  quote: { borderLeftWidth: 2, paddingLeft: Spacing.three },
  buttons: { flexDirection: 'row', gap: Spacing.two },
});
