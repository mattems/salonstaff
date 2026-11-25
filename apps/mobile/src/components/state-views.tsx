import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function LoadingView() {
  const theme = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={theme.brand} />
    </View>
  );
}

export function EmptyView({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.center}>
      <View style={[styles.iconCircle, { backgroundColor: theme.brandSoft }]}>
        <Icon name={icon} size={28} color={theme.brand} />
      </View>
      <Text variant="heading" style={styles.centerText}>
        {title}
      </Text>
      {body ? (
        <Text variant="body" color="textSecondary" style={styles.centerText}>
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} variant="secondary" style={styles.action} />
      ) : null}
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyView
      icon="error"
      title="Something went wrong"
      body={message}
      actionLabel={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
    />
  );
}

/** Inline error box for forms. */
export function ErrorBanner({ message }: { message: string | null | undefined }) {
  const theme = useTheme();
  if (!message) return null;
  return (
    <View style={[styles.banner, { backgroundColor: theme.dangerSoft }]} accessibilityRole="alert">
      <Icon name="error" size={18} color={theme.danger} />
      <Text variant="small" color="danger" style={styles.flex}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.six,
    gap: Spacing.three,
    minHeight: 320,
  },
  centerText: { textAlign: 'center' },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  action: { marginTop: Spacing.three },
  banner: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  flex: { flex: 1 },
});
