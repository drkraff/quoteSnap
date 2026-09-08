import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';

interface AiFailedBannerProps {
  onRerecord: () => void;
  onAddItems: () => void;
}

export function AiFailedBanner({
  onRerecord,
  onAddItems,
}: AiFailedBannerProps): JSX.Element {
  return (
    <View style={styles.banner}>
      <Text style={styles.title}>Couldn't process this recording</Text>
      <Text style={styles.body}>
        Add items from your catalog, or re-record the job.
      </Text>
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.pressed,
          ]}
          onPress={onRerecord}
          accessibilityRole="button"
          accessibilityLabel="Re-record voice quote"
        >
          <Text style={styles.secondaryLabel}>Re-record</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
          ]}
          onPress={onAddItems}
          accessibilityRole="button"
          accessibilityLabel="Add items from catalog"
        >
          <Text style={styles.primaryLabel}>Add items</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: spacing.sm,
  },
  title: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
    color: colors.destructive,
  },
  body: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  primaryButton: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  primaryLabel: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: '#ffffff',
  },
  secondaryButton: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 8,
    backgroundColor: colors.dominant,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  secondaryLabel: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: colors.mutedText,
  },
  pressed: {
    opacity: 0.85,
  },
});
