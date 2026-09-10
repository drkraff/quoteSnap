import { StyleSheet, Text, View } from 'react-native';
import { DEAD_LETTER_EMPTY_BODY, DEAD_LETTER_EMPTY_HEADING } from '../../sync/dead-letter';
import { colors, spacing, typography } from '../../theme/tokens';

export function DeadLetterEmptyState(): JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{DEAD_LETTER_EMPTY_HEADING}</Text>
      <Text style={styles.body}>{DEAD_LETTER_EMPTY_BODY}</Text>
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
