import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MY_RATES_LOAD_ERROR, MY_RATES_RETRY_LABEL } from '../../rate-card/list-copy';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';

interface RatesLoadErrorProps {
  onRetry: () => void;
}

export function RatesLoadError({ onRetry }: RatesLoadErrorProps): JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.body}>{MY_RATES_LOAD_ERROR}</Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={MY_RATES_RETRY_LABEL}
      >
        <Text style={styles.buttonText}>{MY_RATES_RETRY_LABEL}</Text>
      </Pressable>
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
  body: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.mutedText,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.accent,
    width: '100%',
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
});
