import { Pressable, Text, StyleSheet } from 'react-native';
import { LOGOUT_HEADER_LABEL } from '../../navigation/app-tabs';
import { useAuthStore } from '../../store/auth-store';
import { colors, MIN_TOUCH_TARGET, typography } from '../../theme/tokens';

/** AUTH-03 logout without a Settings screen (A-19). */
export function LogoutHeaderButton(): JSX.Element {
  const logout = useAuthStore((s) => s.logout);

  return (
    <Pressable
      onPress={() => {
        void logout();
      }}
      accessibilityRole="button"
      accessibilityLabel={LOGOUT_HEADER_LABEL}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.label}>{LOGOUT_HEADER_LABEL}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    color: colors.accent,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
});
