import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SEND_FEEDBACK_LABEL } from '../../feedback/copy';
import { useFeedback } from '../../feedback/feedback-context';
import { colors, MIN_TOUCH_TARGET } from '../../theme/tokens';

/** Round outlined header control, same family as Settings and Log Out. */
export function SendFeedbackHeaderButton(): JSX.Element {
  const { open } = useFeedback();
  return (
    <Pressable
      onPress={() => {
        void open();
      }}
      accessibilityRole="button"
      accessibilityLabel={SEND_FEEDBACK_LABEL}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
