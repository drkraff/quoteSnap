import { Stack } from 'expo-router';
import { colors } from '../../src/theme/tokens';

export default function AuthLayout(): JSX.Element {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.dominant },
      }}
    />
  );
}
