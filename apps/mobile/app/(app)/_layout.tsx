import { Stack } from 'expo-router';

export default function AppLayout(): JSX.Element {
  return <Stack screenOptions={{ headerTitle: 'QuoteSnap' }} />;
}
