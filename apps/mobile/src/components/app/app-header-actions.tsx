import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SendFeedbackHeaderButton } from '../feedback/send-feedback-header-button';
import { colors, MIN_TOUCH_TARGET, spacing } from '../../theme/tokens';
import { LogoutHeaderButton } from './logout-header-button';

export const SETTINGS_HEADER_LABEL = 'Settings';

export function AppHeaderActions(): JSX.Element {
  const router = useRouter();
  return (
    <View style={styles.row}>
      <SendFeedbackHeaderButton />
      <Pressable
        onPress={() => {
          router.push('/(app)/settings');
        }}
        accessibilityRole="button"
        accessibilityLabel={SETTINGS_HEADER_LABEL}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Ionicons name="settings-outline" size={20} color={colors.text} />
      </Pressable>
      <LogoutHeaderButton />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  button: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
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
