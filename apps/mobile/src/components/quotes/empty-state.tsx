import { View, Text, StyleSheet } from 'react-native';
import { QUOTES_EMPTY_BODY, QUOTES_EMPTY_HEADING } from '../../quotes/empty-copy';
import { colors, spacing, typography } from '../../theme/tokens';

/** Quote history empty list. Voice/manual FABs on the screen are the CTAs. */
export function QuotesEmptyState(): JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{QUOTES_EMPTY_HEADING}</Text>
      <Text style={styles.body}>{QUOTES_EMPTY_BODY}</Text>
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
  },
});
