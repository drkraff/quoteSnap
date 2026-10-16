import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { FeedbackSheet } from './feedback-sheet';
import {
  FEEDBACK_CONTEXT_HINT,
  FEEDBACK_PLACEHOLDER,
  FEEDBACK_SCREENSHOT_LABEL,
  FEEDBACK_SEND,
  SEND_FEEDBACK_LABEL,
} from '../../feedback/copy';
import { FeedbackContext } from '../../feedback/feedback-context';
import { FeedbackFab } from './feedback-fab';

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function press(renderer: ReactTestRenderer, label: string): void {
  const node = renderer.root.findByProps({ accessibilityLabel: label });
  act(() => {
    node.props.onPress();
  });
}

describe('FeedbackSheet', () => {
  it('asks for a note and a rating, and does not send an empty box', () => {
    const onSubmit = jest.fn();
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        <FeedbackSheet
          visible
          screenshotBase64={null}
          submitting={false}
          notice={null}
          onDismiss={jest.fn()}
          onSubmit={onSubmit}
        />,
      );
    });
    const tree = JSON.stringify(renderer!.toJSON());
    expect(tree).toContain(SEND_FEEDBACK_LABEL);
    expect(tree).toContain(FEEDBACK_PLACEHOLDER);
    expect(tree).toContain(FEEDBACK_CONTEXT_HINT);
    expect(tree).not.toContain(FEEDBACK_SCREENSHOT_LABEL);

    const send = renderer!.root.findByProps({ accessibilityLabel: FEEDBACK_SEND });
    expect(send.props.accessibilityState).toEqual({ disabled: true });
    press(renderer!, FEEDBACK_SEND);
    expect(onSubmit).not.toHaveBeenCalled();

    const input = renderer!.root.findByProps({ accessibilityLabel: SEND_FEEDBACK_LABEL });
    act(() => {
      input.props.onChangeText?.('The keypad covered the total');
    });
    press(renderer!, 'How useful: 4 of 5');
    press(renderer!, FEEDBACK_SEND);
    expect(onSubmit).toHaveBeenCalledWith({
      message: 'The keypad covered the total',
      rating: 4,
      includeScreenshot: false,
    });
  });

  it('lets the tester leave the screenshot out', () => {
    const onSubmit = jest.fn();
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        <FeedbackSheet
          visible
          screenshotBase64={PNG}
          submitting={false}
          notice={null}
          onDismiss={jest.fn()}
          onSubmit={onSubmit}
        />,
      );
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain(FEEDBACK_SCREENSHOT_LABEL);
    press(renderer!, FEEDBACK_SCREENSHOT_LABEL);
    const input = renderer!.root.findByProps({ accessibilityLabel: SEND_FEEDBACK_LABEL });
    act(() => {
      input.props.onChangeText?.('Screenshot was the totals row');
    });
    press(renderer!, FEEDBACK_SEND);
    expect(onSubmit).toHaveBeenCalledWith({
      message: 'Screenshot was the totals row',
      rating: null,
      includeScreenshot: false,
    });
  });
});

describe('FeedbackFab', () => {
  it('opens the sheet from the floating button', () => {
    const open = jest.fn(async () => undefined);
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(
        <FeedbackContext.Provider value={{ open }}>
          <FeedbackFab />
        </FeedbackContext.Provider>,
      );
    });
    press(renderer!, SEND_FEEDBACK_LABEL);
    expect(open).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(renderer!.toJSON())).toContain('Feedback');
  });
});
