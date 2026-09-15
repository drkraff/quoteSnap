import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { database } from '../db';
import { Quote } from '../db/models/quote';
import { useAuthStore } from '../store/auth-store';
import { findQuoteRecord } from './find-quote';
import {
  RESUME_PROMPT_DISMISS,
  RESUME_PROMPT_RESUME,
  RESUME_PROMPT_TITLE,
  beginResumePromptIfNeeded,
  pickResumeTarget,
  releaseResumePromptSlot,
  resumePromptBody,
} from './resume-checkpoint';
import {
  clearResumeCheckpoints,
  loadResumeCheckpoint,
} from './resume-checkpoint-store';

/**
 * After auth restore lands on Quotes: one Alert per process if SQLite still
 * has an incomplete recording or draft-edit checkpoint.
 */
export function useResumeAfterCrashPrompt(navigate: (href: string) => void): void {
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Cold-start only. navigate lives on a ref so router identity changes
  // cannot eat the prompt slot.
  useEffect(() => {
    if (!beginResumePromptIfNeeded()) return;
    let cancelled = false;
    let shown = false;

    async function run(): Promise<void> {
      const contractorId = useAuthStore.getState().contractor?.id ?? '';
      if (!contractorId) {
        return;
      }
      let checkpoint = null;
      try {
        checkpoint = await loadResumeCheckpoint(contractorId);
      } catch {
        return;
      }
      if (cancelled) {
        return;
      }

      let quote: Quote | null = null;
      const quoteId = checkpoint?.quoteId;
      if (quoteId) {
        const found = await findQuoteRecord(() =>
          database.get<Quote>('quotes').find(quoteId),
        );
        quote = found.ok ? found.record : null;
      }
      if (cancelled) {
        return;
      }

      const target = pickResumeTarget({ checkpoint, quote });
      shown = true;
      if (!target) {
        if (checkpoint) {
          try {
            await clearResumeCheckpoints(contractorId);
          } catch {
            // Stale row can be overwritten the next time a screen marks.
          }
        }
        return;
      }

      Alert.alert(RESUME_PROMPT_TITLE, resumePromptBody(target.kind), [
        {
          text: RESUME_PROMPT_DISMISS,
          style: 'cancel',
          onPress: () => {
            void clearResumeCheckpoints(contractorId);
          },
        },
        {
          text: RESUME_PROMPT_RESUME,
          onPress: () => {
            navigateRef.current(target.href);
          },
        },
      ]);
    }

    void run();
    return () => {
      cancelled = true;
      if (!shown) {
        releaseResumePromptSlot();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- navigate is a ref
}
