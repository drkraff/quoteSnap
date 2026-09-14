import { View, Pressable, Text, StyleSheet } from 'react-native';
import {
  QUOTES_LIST_MODE_ACTIVE_LABEL,
  QUOTES_LIST_MODE_ARCHIVED_LABEL,
  type QuotesListMode,
} from '../../quotes/list-mode';
import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../theme/tokens';

interface QuotesListModeToggleProps {
  mode: QuotesListMode;
  onChange: (mode: QuotesListMode) => void;
}

export function QuotesListModeToggle({
  mode,
  onChange,
}: QuotesListModeToggleProps): JSX.Element {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      <ModeTab
        label={QUOTES_LIST_MODE_ACTIVE_LABEL}
        selected={mode === 'active'}
        onPress={() => onChange('active')}
      />
      <ModeTab
        label={QUOTES_LIST_MODE_ARCHIVED_LABEL}
        selected={mode === 'archived'}
        onPress={() => onChange('archived')}
      />
    </View>
  );
}

function ModeTab({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.tab,
        selected && styles.tabSelected,
        pressed && styles.tabPressed,
      ]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    padding: 4,
    borderRadius: 10,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  tabSelected: {
    backgroundColor: colors.dominant,
  },
  tabPressed: {
    opacity: 0.85,
  },
  label: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  labelSelected: {
    color: colors.accent,
  },
});
