import type { ComponentRef, Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TextFieldProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  ref?: Ref<ComponentRef<typeof TextInput>>;
};

export function TextField({ label, hint, error, style, multiline, ref, ...rest }: TextFieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="smallStrong" color="textSecondary">
          {label}
        </Text>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={theme.textMuted}
        selectionColor={theme.brand}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            color: theme.text,
            backgroundColor: theme.surface,
            borderColor: error ? theme.danger : theme.border,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="caption" color="danger">
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
  wrap: { gap: Spacing.one + 2 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
});
