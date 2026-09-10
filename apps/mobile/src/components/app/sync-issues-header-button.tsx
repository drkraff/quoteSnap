import { Pressable, StyleSheet } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { syncIssuesHeaderLabel } from '../../sync/dead-letter';
import { useDeadLetterItems } from '../../sync/use-dead-letter-items';
import { colors, MIN_TOUCH_TARGET } from '../../theme/tokens';

/** SYNC-04 entry on Quotes/Catalog (and other app headers) when items are stuck. */
export function SyncIssuesHeaderButton(): JSX.Element | null {
  const items = useDeadLetterItems();
  const router = useRouter();
  const pathname = usePathname();

  if (items.length === 0) return null;
  if (pathname.includes('sync-issues')) return null;

  return (
    <Pressable
      onPress={() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push('/sync-issues' as any);
      }}
      accessibilityRole="button"
      accessibilityLabel={syncIssuesHeaderLabel(items.length)}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons name="warning" size={22} color={colors.destructive} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
