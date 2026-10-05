import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export const ROOT_ERROR_TITLE = 'Something went wrong';

export const ROOT_ERROR_BODY =
  'QuoteSnap could not show this screen. Your quotes are still on this phone.';

export const ROOT_ERROR_RETRY = 'Try again';

type Props = { children: ReactNode };

type State = { failed: boolean; resetKey: number };

/**
 * Catches render errors under the root slot. The contractor sees plain copy
 * and Try again. The error message and component stack are not rendered.
 */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, resetKey: 0 };

  static getDerivedStateFromError(): Pick<State, 'failed'> {
    return { failed: true };
  }

  private retry = (): void => {
    this.setState((prev) => ({ failed: false, resetKey: prev.resetKey + 1 }));
  };

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <View style={styles.screen}>
          <Text style={styles.title}>{ROOT_ERROR_TITLE}</Text>
          <Text style={styles.body}>{ROOT_ERROR_BODY}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ROOT_ERROR_RETRY}
            onPress={this.retry}
            style={styles.button}
          >
            <Text style={styles.buttonText}>{ROOT_ERROR_RETRY}</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View key={this.state.resetKey} style={styles.fill}>
        {this.props.children}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    textAlign: 'center',
    color: '#111111',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    color: '#444444',
    marginTop: 12,
  },
  button: {
    marginTop: 24,
    minHeight: 48,
    minWidth: 160,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#0066cc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
