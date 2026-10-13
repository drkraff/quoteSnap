import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LOGOUT_HEADER_LABEL } from '../../navigation/app-tabs';
import { useAuthStore } from '../../store/auth-store';
import { colors, MIN_TOUCH_TARGET } from '../../theme/tokens';

/** AUTH-03 logout without a Settings screen (A-19). Round outlined header control. */
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
      <Ionicons name="log-out-outline" size={20} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    marginRight: 8,
    borderRadius: MIN_TOUCH_TARGET / 2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dominant,
  },
  pressed: {
    backgroundColor: colors.secondary,
  },
});
