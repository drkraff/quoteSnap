import { StyleSheet, Text, View } from 'react-native';
import { BUILDING_QUOTE_BODY, BUILDING_QUOTE_TITLE } from '../../quotes/building-quote';
import { colors, radius, spacing, typography } from '../../theme/tokens';

const SKELETON_WIDTHS = [280, 220, 168] as const;

/** Shown the moment a recording is queued. Lines replace it when the draft JSON arrives. */
export function BuildingQuoteState(): JSX.Element {
  return (
    <View
      style={styles.screen}
      accessibilityRole="progressbar"
      accessibilityLabel={BUILDING_QUOTE_TITLE}
    >
      <Text style={styles.title}>{BUILDING_QUOTE_TITLE}</Text>
      <Text style={styles.body}>{BUILDING_QUOTE_BODY}</Text>
      <View style={styles.lines}>
        {SKELETON_WIDTHS.map((width) => (
          <View key={width} style={styles.row}>
            <View style={[styles.bar, { width }]} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.dominant,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: typography.heading.fontSize,
    fontWeight: typography.heading.fontWeight,
    lineHeight: typography.heading.lineHeight,
  },
  body: {
    color: colors.mutedText,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    marginTop: spacing.sm,
  },
  lines: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    minHeight: 56,
    borderRadius: radius.card,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  bar: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.border,
  },
});
