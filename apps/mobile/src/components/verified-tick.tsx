import { Icon } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';

/** Shown next to salons whose ABN has been checked. */
export function VerifiedTick({ size = 14 }: { size?: number }) {
  const theme = useTheme();
  return (
    <Icon
      name="verified"
      size={size}
      color={theme.info}
      style={{ marginLeft: 2 }}
    />
  );
}
