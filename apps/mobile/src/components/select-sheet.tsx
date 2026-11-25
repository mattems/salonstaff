import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type Option<V extends string = string> = { value: V; label: string };

type SelectSheetProps<V extends string> = {
  visible: boolean;
  title: string;
  options: readonly Option<V>[];
  value: V | undefined;
  onSelect: (value: V | undefined) => void;
  onClose: () => void;
  /** Label for the "no filter" option. Omit to require a choice. */
  anyLabel?: string;
};

/** Bottom sheet with a single-choice list. */
export function SelectSheet<V extends string>({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
  anyLabel,
}: SelectSheetProps<V>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const rows: { value: V | undefined; label: string }[] = [
    ...(anyLabel ? [{ value: undefined, label: anyLabel }] : []),
    ...options,
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View
        style={[
          styles.sheet,
          { backgroundColor: theme.surface, paddingBottom: insets.bottom + Spacing.three },
        ]}>
        <View style={[styles.handle, { backgroundColor: theme.border }]} />
        <View style={styles.header}>
          <Text variant="heading">{title}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Icon name="close" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>
        <ScrollView style={styles.list}>
          {rows.map((row) => {
            const selected = row.value === value;
            return (
              <Pressable
                key={row.value ?? '__any'}
                onPress={() => {
                  onSelect(row.value);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: theme.border, opacity: pressed ? 0.6 : 1 },
                ]}>
                <Text variant={selected ? 'bodyStrong' : 'body'} color={selected ? 'brand' : 'text'}>
                  {row.label}
                </Text>
                {selected ? <Icon name="check" size={18} color={theme.brand} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    maxHeight: '75%',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.two,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: Spacing.two },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
  },
  list: { paddingHorizontal: Spacing.five },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
