import {
  BRAND,
  JOB_ROLES,
  labelFor,
  PROFILE_VISIBILITY,
  type ProfileVisibility,
} from '@salonstaff/shared';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { profileSection } from '@/components/needs-profile';
import { RadioList } from '@/components/radio-list';
import { Screen } from '@/components/screen';
import { SearchField } from '@/components/search-field';
import { ErrorBanner, ErrorView, LoadingView } from '@/components/state-views';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { api, errorMessage, type HiddenSalon, type MyProfile, type Schemas } from '@/lib/api';
import { siteUrl } from '@/lib/config';

export default profileSection(SharingScreen);

function SharingScreen() {
  const { data, error, loading, refreshing, reload, refresh, setData } = useRequest(
    async () => {
      const [profile, hidden] = await Promise.all([api.profile(), api.hiddenSalons()]);
      return { profile, hidden: hidden.items };
    },
    { refetchOnFocus: true },
  );
  if (loading && !data) return <LoadingView />;
  if (error && !data) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return null;

  const setSettings = (settings: Schemas['ProfileSettings']) =>
    setData((prev) => (prev ? { ...prev, profile: { ...prev.profile, settings } } : prev));

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Visibility value={data.profile.settings.visibility} onSaved={setSettings} />
      {data.profile.settings.sharePath ? (
        <ShareLink full={data.profile} sharePath={data.profile.settings.sharePath} onRenewed={setSettings} />
      ) : null}
      <HiddenSalons salons={data.hidden} onChange={reload} />
    </Screen>
  );
}

// ---------- Who can see it ----------

function Visibility({
  value,
  onSaved,
}: {
  value: ProfileVisibility;
  onSaved: (settings: Schemas['ProfileSettings']) => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function choose(visibility: ProfileVisibility) {
    if (visibility === value || saving) return;
    setProblem(null);
    setSaving(true);
    try {
      onSaved(await api.saveSettings({ visibility }));
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.section}>
      <Text variant="subheading">Who can see your profile</Text>
      <Text variant="small" color="textSecondary">
        Salons you apply to always see your profile, whatever you choose here.
      </Text>
      <RadioList options={PROFILE_VISIBILITY} value={value} onChange={choose} />
      <ErrorBanner message={problem} />
    </View>
  );
}

// ---------- The share link ----------

function ShareLink({
  full,
  sharePath,
  onRenewed,
}: {
  full: MyProfile;
  sharePath: string;
  onRenewed: (settings: Schemas['ProfileSettings']) => void;
}) {
  const theme = useTheme();
  const [renewing, setRenewing] = useState(false);
  const p = full.profile;
  const url = siteUrl(sharePath);
  const shown = url.replace(/^https?:\/\//, '');
  const role = p.roles[0] ? labelFor(JOB_ROLES, p.roles[0]).toLowerCase() : null;
  const caption = `I'm looking for my next role${role ? ` as a ${role}` : ''} around ${p.suburb}. See my work and endorsements on ${BRAND.name}: ${shown}`;

  function renew() {
    Alert.alert('Make a new link?', 'The old link stops working straight away.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'New link',
        onPress: async () => {
          setRenewing(true);
          try {
            onRenewed(await api.newShareCode());
          } catch (err) {
            Alert.alert('Couldn’t make a new link', errorMessage(err));
          } finally {
            setRenewing(false);
          }
        },
      },
    ]);
  }

  return (
    <Card>
      <Text variant="subheading">Your share link</Text>
      <Text variant="small" color="textSecondary">
        Anyone with this link sees your profile with your first name and last initial. Never your
        contact details, work rights or pay. Search engines don’t list it.
      </Text>
      <View style={[styles.link, { backgroundColor: theme.surfaceMuted }]}>
        <Text variant="small" selectable numberOfLines={1}>
          {shown}
        </Text>
      </View>
      <Button
        title="Share"
        onPress={() => Share.share({ message: caption, url, title: `${BRAND.name} profile` })}
      />
      <Button title="Open it" variant="outline" onPress={() => WebBrowser.openBrowserAsync(url)} />
      <Text variant="caption" color="textMuted">
        For Instagram and TikTok, put the link in your bio: they don’t allow links in posts.
      </Text>
      <Button title="Make a new link" variant="ghost" size="sm" loading={renewing} onPress={renew} />
    </Card>
  );
}

// ---------- Salons they hide from ----------

function HiddenSalons({ salons, onChange }: { salons: HiddenSalon[]; onChange: () => Promise<void> }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Schemas['DirectorySalon'][] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const hiddenIds = new Set(salons.map((s) => s.id));

  async function search() {
    const q = query.trim();
    if (!q) return;
    setProblem(null);
    try {
      setResults((await api.searchSalons(q)).items.slice(0, 8));
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  async function setHidden(salonId: string, hidden: boolean) {
    setPending(salonId);
    setProblem(null);
    try {
      if (hidden) await api.hideFromSalon(salonId);
      else await api.unhideFromSalon(salonId);
      if (hidden) {
        setResults(null);
        setQuery('');
      }
      await onChange();
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <Text variant="subheading">Hide from salons</Text>
      <Text variant="small" color="textSecondary">
        Your current salon, say. A salon you hide from can’t see or contact you, unless you apply to
        one of its jobs.
      </Text>
      {salons.map((salon) => (
        <SalonRow
          key={salon.id}
          name={salon.name}
          place={`${salon.suburb}, ${salon.state}`}
          action="Show again"
          disabled={pending !== null}
          onPress={() => setHidden(salon.id, false)}
          borderColor={theme.border}
        />
      ))}
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Find a salon by name"
        onSubmitEditing={search}
      />
      {results?.length === 0 ? (
        <Text variant="small" color="textMuted">
          No salons found.
        </Text>
      ) : null}
      {results
        ?.filter((salon) => !hiddenIds.has(salon.id))
        .map((salon) => (
          <SalonRow
            key={salon.id}
            name={salon.name}
            place={`${salon.suburb}, ${salon.state}`}
            action="Hide"
            disabled={pending !== null}
            onPress={() => setHidden(salon.id, true)}
            borderColor={theme.border}
          />
        ))}
      <ErrorBanner message={problem} />
    </Card>
  );
}

function SalonRow({
  name,
  place,
  action,
  disabled,
  onPress,
  borderColor,
}: {
  name: string;
  place: string;
  action: string;
  disabled: boolean;
  onPress: () => void;
  borderColor: string;
}) {
  return (
    <View style={[styles.salon, { borderColor }]}>
      <View style={styles.flex}>
        <Text variant="bodyStrong">{name}</Text>
        <Text variant="small" color="textSecondary">
          {place}
        </Text>
      </View>
      <Button title={action} size="sm" variant="outline" disabled={disabled} onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: Spacing.two },
  link: { padding: Spacing.three, borderRadius: Radius.md },
  salon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
