import { View, Text, Button, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/store/auth-store';

export default function HomeScreen(): JSX.Element {
  const { contractor, logout } = useAuthStore();

  async function handleLogout(): Promise<void> {
    await logout();
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.welcome}>
        Welcome, {contractor?.displayName ?? contractor?.email ?? 'Contractor'}!
      </Text>
      <Text style={styles.subtitle}>QuoteSnap is ready.</Text>
      <View style={styles.buttonContainer}>
        <Button title="Log Out" onPress={handleLogout} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  welcome: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  buttonContainer: {
    marginTop: 16,
  },
});
