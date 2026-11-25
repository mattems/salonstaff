import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';

/** Card/section title with an optional trailing text action ("Edit", "Manage"). */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text variant="subheading" style={styles.flex}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Text variant="smallStrong" color="brand">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
