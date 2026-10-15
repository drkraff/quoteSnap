import { createContext, useContext } from 'react';

export type FeedbackOpenOptions = {
  quoteId?: string | null;
};

export type FeedbackContextValue = {
  open: (options?: FeedbackOpenOptions) => Promise<void>;
};

export const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback(): FeedbackContextValue {
  const value = useContext(FeedbackContext);
  if (!value) {
    throw new Error('Send feedback is only available in the app');
  }
  return value;
}
