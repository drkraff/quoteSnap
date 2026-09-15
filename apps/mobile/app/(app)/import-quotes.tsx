import { SafeAreaView, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ImportOldQuotesForm } from '../../src/components/rate-card/import-old-quotes-form';
import { IMPORT_SKIP_SETTINGS_LABEL } from '../../src/rate-card/import-copy';
import { useAuthStore } from '../../src/store/auth-store';

export default function ImportQuotesScreen(): JSX.Element {
  const router = useRouter();
  const trade = useAuthStore((state) => state.contractor?.trade);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <ImportOldQuotesForm
          trade={trade}
          skipLabel={IMPORT_SKIP_SETTINGS_LABEL}
          onSkip={() => {
            router.back();
          }}
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
