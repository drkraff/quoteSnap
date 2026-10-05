import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  QUOTE_STATS_WINDOW_OPTIONS,
  type QuoteStatsViewModel,
  type QuoteStatsWindowId,
} from '../../quotes/quote-stats';
import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../theme/tokens';

interface QuoteStatsViewProps {
  view: QuoteStatsViewModel;
  onWindowChange: (windowId: QuoteStatsWindowId) => void;
}

export function QuoteStatsView({ view, onWindowChange }: QuoteStatsViewProps): JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.windowRow} accessibilityRole="tablist">
        {QUOTE_STATS_WINDOW_OPTIONS.map((option) => {
          const selected = view.window === option.id;
          return (
            <Pressable
              key={option.id}
              style={({ pressed }) => [
                styles.windowTab,
                selected && styles.windowTabSelected,
                pressed && styles.windowTabPressed,
              ]}
              onPress={() => onWindowChange(option.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
            >
              <Text style={[styles.windowLabel, selected && styles.windowLabelSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {view.empty ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{view.emptyMessage}</Text>
        </View>
      ) : (
        <View style={styles.rows}>
          {view.rows.map((row) => (
            <View
              key={row.label}
              style={styles.row}
              accessibilityLabel={`${row.label}, ${row.value}`}
            >
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dominant,
  },
  windowRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    padding: 4,
    borderRadius: 10,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  windowTab: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: spacing.xs,
  },
  windowTabSelected: {
    backgroundColor: colors.dominant,
  },
  windowTabPressed: {
    opacity: 0.85,
  },
  windowLabel: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
    textAlign: 'center',
  },
  windowLabelSelected: {
    color: colors.accent,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.mutedText,
    textAlign: 'center',
  },
  rows: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  row: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
  },
  rowLabel: {
    flex: 1,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: '#000000',
    marginRight: spacing.md,
  },
  rowValue: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
    color: '#000000',
  },
});
