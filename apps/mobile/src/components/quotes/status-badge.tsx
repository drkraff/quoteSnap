import { View, Text, StyleSheet } from 'react-native';
import { spacing } from '../../theme/tokens';

interface StatusConfig {
  label: string;
  bg: string;
  text: string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  draft_local: { label: 'Draft', bg: '#e0f0ff', text: '#0066cc' },
  draft_queued: { label: 'Queued', bg: '#e0f0ff', text: '#0066cc' },
  sent: { label: 'Sent', bg: '#f0f0f0', text: '#666666' },
  approved: { label: 'Approved', bg: '#dcfce7', text: '#16a34a' },
  declined: { label: 'Declined', bg: '#fee2e2', text: '#dc2626' },
  expired: { label: 'Expired', bg: '#fee2e2', text: '#dc2626' },
  failed_send: { label: 'Failed', bg: '#fee2e2', text: '#dc2626' },
};

const FALLBACK: StatusConfig = { label: 'Unknown', bg: '#f0f0f0', text: '#666666' };

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  const config = STATUS_MAP[status] ?? FALLBACK;

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.label, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});
