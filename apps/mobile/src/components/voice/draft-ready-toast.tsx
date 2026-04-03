import { useEffect, useRef } from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, typography } from '../../theme/tokens';

interface DraftReadyToastProps {
  visible: boolean;
  draftId: string | null;
  onDismiss: () => void;
}

export function DraftReadyToast({
  visible,
  draftId,
  onDismiss,
}: DraftReadyToastProps): JSX.Element | null {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      timerRef.current = setTimeout(() => {
        onDismiss();
      }, 3000);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible, onDismiss]);

  if (!visible || !draftId) return null;

  function handlePress(): void {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onDismiss();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push(`/draft/${draftId}` as any);
  }

  return (
    <Pressable
      style={styles.container}
      onPress={handlePress}
      accessibilityLiveRegion="polite"
      accessibilityRole="button"
      accessibilityLabel="Quote ready. Tap to review."
    >
      <Text style={styles.message}>Your quote is ready — </Text>
      <Text style={styles.action}>tap to review</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 96,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: '#333333',
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  message: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    color: '#ffffff',
  },
  action: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: colors.accent,
  },
});
