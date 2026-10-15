import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useGlobalSearchParams, usePathname } from 'expo-router';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';
import { apiClient } from '../../api/client';
import { captureCurrentScreen, loadViewShotCapture } from '../../feedback/capture';
import {
  FEEDBACK_FAILED,
  FEEDBACK_QUEUED,
  FEEDBACK_SENT,
} from '../../feedback/copy';
import { FeedbackContext } from '../../feedback/feedback-context';
import { readAppVersion, readPlatform } from '../../feedback/payload';
import { createFeedbackId, type FeedbackQueueItem } from '../../feedback/queue';
import {
  feedbackQuoteIdFromPath,
  feedbackScreenFromPath,
  firstRouteParam,
  isFeedbackUuid,
} from '../../feedback/screen';
import { loadFeedbackQueueFromDisk, saveFeedbackQueueToDisk } from '../../feedback/storage';
import { flushFeedbackQueue, submitFeedback, type FeedbackTransport } from '../../feedback/submit';
import { isOnline, onConnectivityChange } from '../../sync/network-monitor';
import { FeedbackSheet, type FeedbackSheetSubmit } from './feedback-sheet';

export function FeedbackProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const pathnameRef = useRef(pathname);
  const paramsRef = useRef(params);
  pathnameRef.current = pathname;
  paramsRef.current = params;

  const [visible, setVisible] = useState(false);
  const [session, setSession] = useState(0);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [context, setContext] = useState({ screen: 'app', quoteId: null as string | null });
  const opening = useRef(false);

  const transport = useMemo<FeedbackTransport>(
    () => ({
      isOnline: async () => {
        try {
          const state = await NetInfo.fetch();
          return Boolean(state.isConnected);
        } catch {
          return isOnline();
        }
      },
      post: (body) => apiClient.post('/feedback', body),
      load: loadFeedbackQueueFromDisk,
      save: saveFeedbackQueueToDisk,
    }),
    [],
  );

  useEffect(() => {
    void flushFeedbackQueue(transport);
    return onConnectivityChange((online) => {
      if (online) void flushFeedbackQueue(transport);
    });
  }, [transport]);

  const open = useCallback(async (options?: { quoteId?: string | null }) => {
    if (opening.current) return;
    opening.current = true;
    try {
      const path = pathnameRef.current;
      const routeQuoteId = feedbackQuoteIdFromPath(path, firstRouteParam(paramsRef.current['id']));
      const explicit = options?.quoteId?.trim();
      const quoteId = explicit && isFeedbackUuid(explicit) ? explicit : routeQuoteId;
      setContext({ screen: feedbackScreenFromPath(path), quoteId });
      const shot = await captureCurrentScreen(loadViewShotCapture());
      setScreenshot(shot);
      setNotice(null);
      setSession((current) => current + 1);
      setVisible(true);
    } finally {
      opening.current = false;
    }
  }, []);

  async function onSubmit(input: FeedbackSheetSubmit): Promise<void> {
    if (submitting) return;
    setSubmitting(true);
    setNotice(null);
    const item: FeedbackQueueItem = {
      id: createFeedbackId(),
      createdAt: new Date().toISOString(),
      message: input.message,
      rating: input.rating,
      screen: context.screen,
      quoteId: context.quoteId,
      appVersion: readAppVersion(Constants.expoConfig?.version),
      platform: readPlatform(Platform.OS),
      screenshotBase64: input.includeScreenshot ? screenshot : null,
    };
    try {
      const result = await submitFeedback(item, transport);
      if (result === 'rejected') {
        setNotice(FEEDBACK_FAILED);
        return;
      }
      setNotice(result === 'sent' ? FEEDBACK_SENT : FEEDBACK_QUEUED);
      setSession((current) => current + 1);
    } catch {
      setNotice(FEEDBACK_FAILED);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FeedbackContext.Provider value={{ open }}>
      {children}
      <FeedbackSheet
        key={session}
        visible={visible}
        screenshotBase64={screenshot}
        submitting={submitting}
        notice={notice}
        onDismiss={() => {
          setVisible(false);
          setNotice(null);
        }}
        onSubmit={(input) => {
          void onSubmit(input);
        }}
      />
    </FeedbackContext.Provider>
  );
}
