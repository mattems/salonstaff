import type { VerificationStatus } from '@salonstaff/shared';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { Pill, type Tone } from '@/components/pill';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { VERIFICATION_STATUS_LABELS } from '@/lib/format';

const STATUS_TONES: Record<VerificationStatus, Tone> = {
  not_started: 'neutral',
  pending: 'info',
  requires_input: 'warning',
  verified: 'success',
  failed: 'danger',
};

export function VerificationStep({
  step,
  icon,
  title,
  description,
  status,
  children,
}: {
  step: number;
  icon: IconName;
  title: string;
  description: string;
  status: VerificationStatus;
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  const verified = status === 'verified';
  return (
    <Card>
      <View style={styles.header}>
        <View
          style={[
            styles.marker,
            { backgroundColor: verified ? theme.success : theme.brandSoft },
          ]}>
          {verified ? (
            <Icon name="check" size={16} color={theme.surface} />
          ) : (
            <Icon name={icon} size={18} color={theme.brand} />
          )}
        </View>
        <View style={styles.headerText}>
          <Text variant="caption" color="textMuted">
            Step {step}
          </Text>
          <Text variant="subheading">{title}</Text>
        </View>
        <Pill label={VERIFICATION_STATUS_LABELS[status]} tone={STATUS_TONES[status]} />
      </View>
      <Text variant="small" color="textSecondary">
        {description}
      </Text>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  marker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
});
