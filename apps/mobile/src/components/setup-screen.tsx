import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type SetupStep, useSetup } from '@/lib/setup';

/**
 * One step of setting up (D-24): back, a bar per step filled up to this one, the question, what
 * they answer it with, and the buttons kept at the bottom (above the keyboard).
 */
export function SetupScreen({
  step,
  title,
  subtitle,
  children,
  footer,
}: {
  step: SetupStep;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  footer: ReactNode;
}) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { steps } = useSetup();
  const index = steps.indexOf(step);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.top, { paddingTop: insets.top + Spacing.two }]}>
        {index > 0 ? (
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [
              styles.back,
              { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Icon name="chevronLeft" size={16} color={theme.text} />
          </Pressable>
        ) : null}
        <View
          style={styles.bars}
          accessible
          accessibilityLabel={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((s, i) => (
            <View
              key={s}
              style={[styles.bar, { backgroundColor: i <= index ? theme.brand : theme.border }]}
            />
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text color="textSecondary">{subtitle}</Text> : null}
        </View>
        {children}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.four) }]}>
        {footer}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.three,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bars: { flex: 1, flexDirection: 'row', gap: Spacing.one, minHeight: 36, alignItems: 'center' },
  bar: { flex: 1, height: 4, borderRadius: Radius.pill },
  content: { padding: Spacing.five, paddingTop: Spacing.four, gap: Spacing.four },
  intro: { gap: Spacing.two, marginBottom: Spacing.two },
  footer: { paddingHorizontal: Spacing.five, paddingTop: Spacing.three, gap: Spacing.two },
});
