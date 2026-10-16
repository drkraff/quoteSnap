export const SEND_FEEDBACK_LABEL = 'Send feedback';
export const FEEDBACK_SHEET_HINT = 'For us. Not sent to your customer.';
export const FEEDBACK_PLACEHOLDER = 'What should we know?';
export const FEEDBACK_RATING_LABEL = 'How useful is this? Optional.';
export const FEEDBACK_SCREENSHOT_LABEL = 'Include a screenshot of this screen';
export const FEEDBACK_CONTEXT_HINT = "Includes this screen, the app version, and the quote if you're on one.";
export const FEEDBACK_SEND = 'Send';
export const FEEDBACK_CANCEL = 'Cancel';
export const FEEDBACK_SENT = 'Sent. Thank you.';
export const FEEDBACK_QUEUED = "Saved on this phone. We'll send it when you're back online.";
export const FEEDBACK_FAILED = 'Could not send that note. Try again.';

/** Matches the API cap in apps/backend/src/feedback/validate.ts. */
export const FEEDBACK_MESSAGE_MAX = 4000;
export const FEEDBACK_QUEUE_LIMIT = 20;
export const FEEDBACK_SCREENSHOT_MAX_BYTES = 1_048_576;
