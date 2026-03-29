import { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';

interface UndoToastProps {
  visible: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}

export function UndoToast({ visible, onUndo, onDismiss }: UndoToastProps): JSX.Element | null {
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

  if (!visible) return null;

  function handleUndo(): void {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onUndo();
  }

  return (
    <View
      style={styles.container}
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.message}>Item archived. </Text>
      <Pressable
        onPress={handleUndo}
        accessibilityRole="button"
        accessibilityLabel="Undo archive"
      >
        <Text style={styles.undoText}>Undo</Text>
      </Pressable>
    </View>
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
  undoText: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: colors.accent,
  },
});
