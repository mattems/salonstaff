import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { SetupScreen } from '@/components/setup-screen';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBiometricLock } from '@/lib/biometric-lock';
import { useSetup } from '@/lib/setup';

/**
 * Step 7, the last: the Face ID offer (D-21), here instead of the pop-up after signing in. Only on
 * phones with Face ID, Touch ID or a fingerprint set up.
 */
export default function SetupFaceIdScreen() {
  const theme = useTheme();
  const { next } = useSetup();
  const { kind, setEnabled } = useBiometricLock();
  const [asking, setAsking] = useState(false);
  const label = kind ?? 'Face ID';

  async function turnOn() {
    setAsking(true);
    try {
      await setEnabled(true);
    } finally {
      setAsking(false);
      next('face-id');
    }
  }

  return (
    <SetupScreen
      step="face-id"
      title={`Use ${label} to open Salon Staff?`}
      subtitle={`You’ll stay signed in, and the app asks for ${label} each time you open it, so your messages stay private.`}
      footer={
        <>
          <Button title={`Use ${label}`} loading={asking} onPress={turnOn} />
          <Button title="Not now" variant="ghost" disabled={asking} onPress={() => next('face-id')} />
        </>
      }>
      <View style={styles.icon}>
        <View style={[styles.badge, { backgroundColor: theme.brandSoft }]}>
          <Icon name="lock" size={40} color={theme.brand} />
        </View>
      </View>
      <Text variant="small" color="textMuted" style={styles.center}>
        You can turn it off in Settings.
      </Text>
    </SetupScreen>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: 'center', paddingVertical: Spacing.five },
  badge: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
