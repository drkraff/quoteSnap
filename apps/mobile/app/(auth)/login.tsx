import { colors } from '../../src/theme/tokens';
import { useState } from 'react';
import { Pressable, Text, TextInput, StyleSheet } from 'react-native';
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
      <Text style={styles.title}>Vela</Text>
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

      <Pressable
        style={({ pressed }) => [styles.button, (loading || pressed) && styles.buttonPressed]}
        onPress={handleLogin}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={loading ? 'Logging in...' : 'Log In'}
      >
        <Text style={styles.buttonText}>{loading ? 'Logging in...' : 'Log In'}</Text>
      </Pressable>

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
    backgroundColor: colors.dominant,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    color: colors.mutedText,
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
    color: colors.text,
  },
  error: {
    color: colors.errorText,
    marginBottom: 12,
    fontSize: 14,
  },
  button: {
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  link: {
    marginTop: 16,
    textAlign: 'center',
    color: colors.accent,
    fontSize: 14,
  },
});
