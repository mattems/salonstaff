import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Segment<V extends string> = { value: V; label: string };

export function SegmentedControl<V extends string>({
  segments,
  value,
  onChange,
}: {
  segments: readonly Segment<V>[];
  value: V;
  onChange: (value: V) => void;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.track, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
      {segments.map((s) => {
        const selected = s.value === value;
        return (
          <Pressable
            key={s.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(s.value)}
            style={[
              styles.segment,
              selected && [styles.selected, { backgroundColor: theme.surface, shadowColor: theme.text }],
            ]}>
            <Text variant="smallStrong" color={selected ? 'text' : 'textMuted'}>
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
  },
  selected: {
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
