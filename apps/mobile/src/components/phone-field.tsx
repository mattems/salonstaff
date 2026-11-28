import type { ComponentRef, Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The nine digits after +61, from whatever was typed, pasted or filled in: "0412 345 678",
 * "+61 412 345 678" and "412345678" all give "412345678".
 */
export function auMobileDigits(text: string): string {
  let digits = text.replace(/\D/g, '');
  if (digits.startsWith('61') && digits.length > 9) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 9);
}

/** "412345678" → "412 345 678", as it's typed. */
function grouped(digits: string): string {
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean).join(' ');
}

type PhoneFieldProps = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  /** The digits after +61 (see `auMobileDigits`). */
  digits: string;
  onChangeDigits: (digits: string) => void;
  error?: string | null;
  hint?: string;
  ref?: Ref<ComponentRef<typeof TextInput>>;
};

/** An Australian mobile number, with +61 already there. */
export function PhoneField({ digits, onChangeDigits, error, hint, ref, ...rest }: PhoneFieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.box,
          { backgroundColor: theme.surface, borderColor: error ? theme.danger : theme.border },
        ]}>
        <View style={[styles.prefix, { borderRightColor: theme.border }]}>
          <Text variant="bodyStrong">🇦🇺 +61</Text>
        </View>
        <TextInput
          ref={ref}
          value={grouped(digits)}
          onChangeText={(t) => onChangeDigits(auMobileDigits(t))}
          placeholder="412 345 678"
          placeholderTextColor={theme.textMuted}
          selectionColor={theme.brand}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          accessibilityLabel="Mobile number, after plus 61"
          style={[styles.input, { color: theme.text }]}
          {...rest}
        />
      </View>
      {error ? (
        <Text variant="small" color="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  prefix: {
    paddingHorizontal: Spacing.four,
    height: '100%',
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    height: '100%',
    paddingHorizontal: Spacing.four,
    fontSize: 20,
    fontWeight: '600',
    // No letter spacing or tabular figures: iOS doesn't give them to the placeholder.
  },
});
