import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import {
  ROOT_ERROR_BODY,
  ROOT_ERROR_RETRY,
  ROOT_ERROR_TITLE,
  RootErrorBoundary,
} from './root-error-boundary';

function Boom(props: { message: string }): React.JSX.Element {
  throw new Error(props.message);
}

describe('RootErrorBoundary', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows what happened and Try again without a stack trace', () => {
    const secret = 'SECRET_STACK at RootLayout (app/_layout.tsx:52)';
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        <RootErrorBoundary>
          <Boom message={secret} />
        </RootErrorBoundary>,
      );
    });

    const tree = JSON.stringify(renderer!.toJSON());
    expect(tree).toContain(ROOT_ERROR_TITLE);
    expect(tree).toContain(ROOT_ERROR_BODY);
    expect(tree).toContain(ROOT_ERROR_RETRY);
    expect(tree).not.toContain(secret);
    expect(tree).not.toContain('RootLayout');
    expect(tree).not.toContain('stack');
    expect(ROOT_ERROR_BODY.toLowerCase()).not.toContain('exception');
  });

  it('renders the child again after Try again', () => {
    let explode = true;
    function MaybeBoom(): React.JSX.Element {
      if (explode) {
        explode = false;
        throw new Error('once');
      }
      return <Text>back</Text>;
    }

    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        <RootErrorBoundary>
          <MaybeBoom />
        </RootErrorBoundary>,
      );
    });

    const retry = renderer!.root.findByProps({ accessibilityLabel: ROOT_ERROR_RETRY });
    act(() => {
      retry.props.onPress();
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain('back');
  });
});
