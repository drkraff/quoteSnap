import { StyleSheet, TextInput } from 'react-native';
import { MY_RATES_SEARCH_PLACEHOLDER } from '../../rate-card/list-copy';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';

interface RatesSearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
}

export function RatesSearchField({
  value,
  onChangeText,
  onSubmit,
}: RatesSearchFieldProps): JSX.Element {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onSubmitEditing={onSubmit}
      placeholder={MY_RATES_SEARCH_PLACEHOLDER}
      placeholderTextColor={colors.mutedText}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      accessibilityRole="search"
      accessibilityLabel={MY_RATES_SEARCH_PLACEHOLDER}
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: MIN_TOUCH_TARGET,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: typography.body.fontSize,
    color: '#000000',
    backgroundColor: colors.secondary,
  },
});
