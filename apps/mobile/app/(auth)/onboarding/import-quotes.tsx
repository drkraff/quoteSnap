import { SafeAreaView, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ImportOldQuotesForm } from '../../../src/components/rate-card/import-old-quotes-form';
import { IMPORT_SKIP_ONBOARDING_LABEL } from '../../../src/rate-card/import-copy';

export default function OnboardingImportQuotesScreen(): JSX.Element {
  const { trade, itemCount } = useLocalSearchParams<{ trade?: string; itemCount?: string }>();
  const router = useRouter();

  function goToReady(): void {
    router.replace({
      pathname: '/(auth)/onboarding/ready',
      params: {
        trade: trade ?? '',
        itemCount: itemCount ?? '0',
      },
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <ImportOldQuotesForm
          trade={trade}
          skipLabel={IMPORT_SKIP_ONBOARDING_LABEL}
          onSkip={goToReady}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scroll: {
    padding: 24,
    paddingBottom: 40,
  },
});
