import { useState } from 'react';
import { Text, TextInput, Button, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import {
  credentialsFromIdentifier,
  parseAuthIdentifier,
} from '../../src/auth/auth-identifier';
import { useAuthStore } from '../../src/store/auth-store';

export default function Login(): JSX.Element {
  const store = useAuthStore();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(): Promise<void> {
    if (!identifier.trim() || !password) {
      setError('Email or phone and password are required.');
      return;
    }
    const parsed = parseAuthIdentifier(identifier);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await store.login(credentialsFromIdentifier(parsed.identifier, password));
    } catch (err: unknown) {
      const message =
        err !== null &&
        typeof err === 'object' &&
        'error' in err &&
        typeof (err as { error: unknown }).error === 'string'
          ? (err as { error: string }).error
          : 'Login failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>QuoteSnap</Text>
      <Text style={styles.subtitle}>Log in to your account</Text>

      <TextInput
        style={styles.input}
        placeholder="Email or phone number"
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="default"
        autoComplete="username"
        textContentType="username"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
      />

      {error !== null ? <Text style={styles.error}>{error}</Text> : null}

      <Button title={loading ? 'Logging in...' : 'Log In'} onPress={handleLogin} disabled={loading} />

      <Link href="/(auth)/register" style={styles.link}>
        Don&apos;t have an account? Register
      </Link>
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  error: {
    color: '#cc0000',
    marginBottom: 12,
    fontSize: 14,
  },
  link: {
    marginTop: 16,
    textAlign: 'center',
    color: '#0066cc',
    fontSize: 14,
  },
});
