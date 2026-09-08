import { View, Text, StyleSheet } from 'react-native';
import { getQuoteStatusDisplay } from '../../quotes/status-display';
import { spacing } from '../../theme/tokens';

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  const config = getQuoteStatusDisplay(status);

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text
        style={[styles.label, { color: config.text }]}
        numberOfLines={2}
      >
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
    maxWidth: 140,
    flexShrink: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});
