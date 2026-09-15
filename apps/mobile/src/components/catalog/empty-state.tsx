import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';

interface EmptyStateProps {
  onAddItem: () => void;
  onImportOldQuotes?: () => void;
}

export function EmptyState({ onAddItem, onImportOldQuotes }: EmptyStateProps): JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>No items yet</Text>
      <Text style={styles.body}>Add your first item to get started</Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={onAddItem}
        accessibilityRole="button"
        accessibilityLabel="Add Item"
      >
        <Text style={styles.buttonText}>Add Item</Text>
      </Pressable>
      {onImportOldQuotes ? (
        <Pressable
          style={({ pressed }) => [styles.secondary, pressed && styles.buttonPressed]}
          onPress={onImportOldQuotes}
          accessibilityRole="button"
          accessibilityLabel="Import old quotes"
        >
          <Text style={styles.secondaryText}>Import old quotes</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  heading: {
    fontSize: typography.heading.fontSize,
    fontWeight: typography.heading.fontWeight,
    lineHeight: typography.heading.lineHeight,
    color: '#000000',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.mutedText,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.accent,
    width: '100%',
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
  secondary: {
    width: '100%',
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  secondaryText: {
    color: colors.accent,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
});
