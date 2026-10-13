import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COPY_APPROVAL_LINK_LABEL } from '../../quotes/copy-approval-link';
import { colors, radius, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';

interface CopyApprovalLinkButtonProps {
  busy?: boolean;
  message?: string | null;
  onPress: () => void;
}

/** Shown on a sent quote. Copies the existing approval page link. */
export function CopyApprovalLinkButton({
  busy = false,
  message = null,
  onPress,
}: CopyApprovalLinkButtonProps): JSX.Element {
  const label = busy ? 'Copying…' : COPY_APPROVAL_LINK_LABEL;
  return (
    <View style={styles.wrap}>
      <Pressable
        style={({ pressed }) => [styles.button, (pressed || busy) && styles.pressed]}
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={COPY_APPROVAL_LINK_LABEL}
        accessibilityState={{ disabled: busy, busy }}
      >
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  button: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    color: colors.text,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
    lineHeight: typography.body.lineHeight,
  },
  message: {
    color: colors.mutedText,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    textAlign: 'center',
  },
});
