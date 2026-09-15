import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  CATALOG_ADD_ITEM_LABEL,
  CATALOG_EMPTY_BODY,
  CATALOG_EMPTY_HEADING,
  CATALOG_IMPORT_OLD_QUOTES_LABEL,
} from '../../catalog/list-copy';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';

interface EmptyStateProps {
  onAddItem: () => void;
  onImportOldQuotes?: () => void;
}

export function EmptyState({ onAddItem, onImportOldQuotes }: EmptyStateProps): JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{CATALOG_EMPTY_HEADING}</Text>
      <Text style={styles.body}>{CATALOG_EMPTY_BODY}</Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={onAddItem}
        accessibilityRole="button"
        accessibilityLabel={CATALOG_ADD_ITEM_LABEL}
      >
        <Text style={styles.buttonText}>{CATALOG_ADD_ITEM_LABEL}</Text>
      </Pressable>
      {onImportOldQuotes ? (
        <Pressable
          style={({ pressed }) => [styles.secondary, pressed && styles.buttonPressed]}
          onPress={onImportOldQuotes}
          accessibilityRole="button"
          accessibilityLabel={CATALOG_IMPORT_OLD_QUOTES_LABEL}
        >
          <Text style={styles.secondaryText}>{CATALOG_IMPORT_OLD_QUOTES_LABEL}</Text>
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
