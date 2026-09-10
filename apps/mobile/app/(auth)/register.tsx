import { useState } from 'react';
import { Text, TextInput, Button, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import {
  credentialsFromIdentifier,
  parseAuthIdentifier,
} from '../../src/auth/auth-identifier';
import { useAuthStore } from '../../src/store/auth-store';

export default function Register(): JSX.Element {
  const store = useAuthStore();
  const [displayName, setDisplayName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRegister(): Promise<void> {
    if (!identifier.trim() || !password) {
      setError('Email or phone and password are required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
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
      await store.register({
        ...credentialsFromIdentifier(parsed.identifier, password),
        displayName: displayName.trim() || undefined,
      });
    } catch (err: unknown) {
      const message =
        err !== null &&
        typeof err === 'object' &&
        'error' in err &&
        typeof (err as { error: unknown }).error === 'string'
          ? (err as { error: string }).error
          : 'Registration failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>QuoteSnap</Text>
      <Text style={styles.subtitle}>Create your account</Text>

      <TextInput
        style={styles.input}
        placeholder="Display name (optional)"
        value={displayName}
        onChangeText={setDisplayName}
        autoCapitalize="words"
        autoComplete="name"
      />

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
        placeholder="Password (min 8 characters)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
      />

      {error !== null ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        title={loading ? 'Creating account...' : 'Create Account'}
        onPress={handleRegister}
        disabled={loading}
      />

      <Link href="/(auth)/login" style={styles.link}>
        Already have an account? Log In
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
