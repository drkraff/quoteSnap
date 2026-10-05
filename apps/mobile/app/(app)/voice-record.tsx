import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Linking,
  SafeAreaView,
  AppState,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { database } from '../../src/db';
import { Quote } from '../../src/db/models/quote';
import { Draft } from '../../src/db/models/draft';
import { enqueue } from '../../src/sync/sync-queue';
import { useAuthStore } from '../../src/store/auth-store';
import { RecordingWaveform } from '../../src/components/voice/recording-waveform';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../../src/theme/tokens';
import {
  MIC_PERMISSION_BODY,
  MIC_PERMISSION_CANCEL,
  MIC_PERMISSION_OPEN_SETTINGS,
  MIC_PERMISSION_TITLE,
} from '../../src/quotes/mic-permission';
import { localVoiceAudioPath } from '../../src/quotes/voice-audio';
import { findQuoteRecord } from '../../src/quotes/find-quote';
import { parseReuseQuoteId } from '../../src/quotes/retry-voice-quote';
import { assignStoredAiFailureStage } from '../../src/quotes/ai-failed-recovery';
import {
  voiceUploadEnqueueParams,
} from '../../src/quotes/voice-upload-queue';
import {
  VOICE_UPLOAD_RETRY_BODY,
  VOICE_UPLOAD_RETRY_LABEL,
  shouldClearVoiceCheckpointOnLeave,
  shouldPersistRecordingOnBackground,
  voiceEnqueueFailureUx,
  voiceStopFailureUx,
} from '../../src/quotes/voice-recording-session';
import {
  RESUME_KIND_VOICE,
  pendingVoiceUploadFromCheckpoint,
} from '../../src/quotes/resume-checkpoint';
import {
  clearResumeCheckpoints,
  loadResumeCheckpoint,
  upsertResumeCheckpoint,
} from '../../src/quotes/resume-checkpoint-store';

type RecordingState = 'idle' | 'recording' | 'stopped';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function VoiceRecordScreen(): JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { quoteId: reuseQuoteId } = useLocalSearchParams<{ quoteId?: string }>();
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);
  const pendingUploadRef = useRef<{ quoteId: string; filePath: string } | null>(null);
  const keepVoiceCheckpointRef = useRef(false);
  const [pendingUpload, setPendingUpload] = useState<{ quoteId: string; filePath: string } | null>(
    null,
  );

  const rememberPending = useCallback((next: { quoteId: string; filePath: string } | null) => {
    pendingUploadRef.current = next;
    setPendingUpload(next);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setRecordingState('idle');
      setDurationSeconds(0);
      const contractorId = useAuthStore.getState().contractor?.id ?? '';
      const reuseId = parseReuseQuoteId(reuseQuoteId);
      let cancelled = false;
      if (contractorId && reuseId) {
        keepVoiceCheckpointRef.current = true;
        void (async () => {
          try {
            const checkpoint = await loadResumeCheckpoint(contractorId);
            const found = await findQuoteRecord(() =>
              database.get<Quote>('quotes').find(reuseId),
            );
            const pending = pendingVoiceUploadFromCheckpoint({
              checkpoint,
              routeQuoteId: reuseId,
              quoteStatus: found.ok ? found.record.status : null,
            });
            if (cancelled) {
              keepVoiceCheckpointRef.current = pending != null;
              return;
            }
            if (pending) {
              keepVoiceCheckpointRef.current = true;
              rememberPending(pending);
              setRecordingState('stopped');
            } else {
              keepVoiceCheckpointRef.current = false;
            }
          } catch {
            keepVoiceCheckpointRef.current = true;
          }
        })();
      }
      return () => {
        cancelled = true;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        const recording = recordingRef.current;
        recordingRef.current = null;
        if (recording) {
          void recording.stopAndUnloadAsync().catch(() => {
            // Intentional leave — discard the in-progress cache take.
          });
        }
        const keep = pendingUploadRef.current != null || keepVoiceCheckpointRef.current;
        if (
          contractorId
          && shouldClearVoiceCheckpointOnLeave(keep)
        ) {
          void clearResumeCheckpoints(contractorId, RESUME_KIND_VOICE).catch(() => {
            // Leaving the recorder must not throw.
          });
        }
      };
    }, [rememberPending, reuseQuoteId]),
  );

  const handleStartRecording = useCallback(async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert(
          MIC_PERMISSION_TITLE,
          MIC_PERMISSION_BODY,
          [
            { text: MIC_PERMISSION_CANCEL, style: 'cancel' },
            { text: MIC_PERMISSION_OPEN_SETTINGS, onPress: () => { void Linking.openSettings(); } },
          ],
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );

      keepVoiceCheckpointRef.current = false;
      recordingRef.current = recording;
      setRecordingState('recording');
      setDurationSeconds(0);

      intervalRef.current = setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
      }, 1000);

      const contractorId = useAuthStore.getState().contractor?.id ?? '';
      const reuseId = parseReuseQuoteId(reuseQuoteId);
      void upsertResumeCheckpoint({
        contractorId,
        kind: RESUME_KIND_VOICE,
        quoteId: reuseId || null,
        audioUri: recording.getURI(),
      }).catch(() => {
        // FAIL-07 must not block or Alert during a take.
      });
    } catch {
      Alert.alert('Recording Error', 'Failed to start recording. Please try again.');
    }
  }, [reuseQuoteId]);

  const handleStopRecording = useCallback(async () => {
    if (stoppingRef.current) return;
    const recording = recordingRef.current;
    if (!recording) return;
    stoppingRef.current = true;
    recordingRef.current = null;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    let persisted = false;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      if (!uri) {
        throw new Error('No recording URI available');
      }

      // VOICE-02: Move from cacheDirectory to documentDirectory immediately.
      // FAIL-04: name the file after the quote id so Retry can find it later.
      const contractorId = useAuthStore.getState().contractor?.id ?? '';
      let newQuoteId = '';
      const reuseId = parseReuseQuoteId(reuseQuoteId);
      if (reuseId) {
        const found = await findQuoteRecord(() =>
          database.get<Quote>('quotes').find(reuseId),
        );
        if (found.ok) {
          newQuoteId = found.record.id;
          await database.write(async () => {
            await found.record.update((r) => {
              r.status = 'ai_processing';
              r.voiceJobId = null;
              assignStoredAiFailureStage(r, 'ai_processing');
            });
          });
        }
      }
      if (!newQuoteId) {
        await database.write(async () => {
          const newQuote = await database.get<Quote>('quotes').create((r) => {
            r.contractorId = contractorId;
            r.status = 'ai_processing';
            r.totalCents = 0;
            r.isArchived = false;
          });
          newQuoteId = newQuote.id;
          await database.get<Draft>('drafts').create((r) => {
            r.quoteId = newQuote.id;
            r.lineItemsJson = '[]';
          });
        });
      }

      const dest = localVoiceAudioPath(newQuoteId, FileSystem.documentDirectory);
      const existing = await FileSystem.getInfoAsync(dest);
      if (existing.exists) {
        await FileSystem.deleteAsync(dest, { idempotent: true });
      }
      await FileSystem.moveAsync({ from: uri, to: dest });
      persisted = true;

      // Reset audio mode
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      // Point the checkpoint at the saved file until the queue row exists.
      try {
        await upsertResumeCheckpoint({
          contractorId,
          kind: RESUME_KIND_VOICE,
          quoteId: newQuoteId,
          audioUri: dest,
        });
      } catch {
        // Local quote + m4a already exist.
      }

      // FAIL-03: local m4a + quote are already durable. Enqueue the voice
      // job. If the queue write fails, stay here so the contractor can retry
      // — do not Alert, and do not leave with no queue row.
      let queued = false;
      try {
        await enqueue(voiceUploadEnqueueParams(newQuoteId, dest));
        queued = true;
      } catch {
        queued = false;
      }

      if (voiceEnqueueFailureUx(queued) === 'retry_on_screen') {
        rememberPending({ quoteId: newQuoteId, filePath: dest });
        setRecordingState('stopped');
        return;
      }

      try {
        await clearResumeCheckpoints(contractorId, RESUME_KIND_VOICE);
      } catch {
        // Upload is already queued.
      }

      rememberPending(null);
      setRecordingState('stopped');
      router.back();
    } catch {
      let granted = false;
      try {
        const permission = await Audio.getPermissionsAsync();
        granted = permission.granted;
      } catch {
        granted = false;
      }
      const ux = voiceStopFailureUx({ persisted, permissionGranted: granted });
      if (ux === 'mic_settings') {
        Alert.alert(
          MIC_PERMISSION_TITLE,
          MIC_PERMISSION_BODY,
          [
            { text: MIC_PERMISSION_CANCEL, style: 'cancel' },
            { text: MIC_PERMISSION_OPEN_SETTINGS, onPress: () => { void Linking.openSettings(); } },
          ],
        );
      } else if (ux === 'save_alert') {
        Alert.alert('Recording Error', 'Failed to save recording. Please try again.');
      }
      setRecordingState('idle');
    } finally {
      stoppingRef.current = false;
    }
  }, [rememberPending, router, reuseQuoteId]);

  const retryPendingUpload = useCallback(async () => {
    const pending = pendingUploadRef.current;
    if (!pending) return;
    try {
      await enqueue(voiceUploadEnqueueParams(pending.quoteId, pending.filePath));
      const contractorId = useAuthStore.getState().contractor?.id ?? '';
      if (contractorId) {
        await clearResumeCheckpoints(contractorId, RESUME_KIND_VOICE).catch(() => {});
      }
      rememberPending(null);
      router.back();
    } catch {
      // Stay on this screen so Try again is still there.
    }
  }, [rememberPending, router]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (shouldPersistRecordingOnBackground(next, recordingRef.current != null)) {
        void handleStopRecording();
      }
    });
    return () => subscription.remove();
  }, [handleStopRecording]);

  const handleMicPress = useCallback(() => {
    if (recordingState === 'idle') {
      void handleStartRecording();
    } else if (recordingState === 'recording') {
      void handleStopRecording();
    }
  }, [recordingState, handleStartRecording, handleStopRecording]);

  const isRecording = recordingState === 'recording';

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      {/* Close button */}
      <Pressable
        style={styles.closeButton}
        onPress={() => router.back()}
        accessibilityLabel="Close recording screen"
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close-outline" size={24} color={colors.mutedText} />
      </Pressable>

      {/* Title */}
      <Text style={styles.title}>Describe the job</Text>

      {/* Content area */}
      <View style={styles.content}>
        {pendingUpload ? (
          <View style={styles.retryBlock}>
            <Text style={styles.hint}>{VOICE_UPLOAD_RETRY_BODY}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => {
                void retryPendingUpload();
              }}
              accessibilityRole="button"
              accessibilityLabel={VOICE_UPLOAD_RETRY_LABEL}
            >
              <Text style={styles.retryButtonText}>{VOICE_UPLOAD_RETRY_LABEL}</Text>
            </Pressable>
          </View>
        ) : null}
        {/* Waveform — visible only during recording */}
        {isRecording && (
          <View style={styles.waveformContainer}>
            <RecordingWaveform isRecording={isRecording} />
          </View>
        )}

        {/* Mic / Stop button */}
        <Pressable
          style={[
            styles.micButton,
            isRecording && styles.micButtonRecording,
          ]}
          onPress={handleMicPress}
          accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
          accessibilityRole="button"
          disabled={pendingUpload != null}
        >
          <Ionicons
            name={isRecording ? 'stop-outline' : 'mic-outline'}
            size={32}
            color="#ffffff"
          />
        </Pressable>

        {/* Duration counter */}
        <Text style={styles.duration}>
          {formatDuration(durationSeconds)}
        </Text>

        {/* Hint text */}
        <Text style={styles.hint}>
          {isRecording ? 'Tap to stop' : 'Tap to record'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dominant,
  },
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  title: {
    fontSize: typography.heading.fontSize,
    fontWeight: typography.heading.fontWeight,
    lineHeight: typography.heading.lineHeight,
    color: '#000000',
    textAlign: 'center',
    marginTop: MIN_TOUCH_TARGET + spacing.md,
    marginHorizontal: spacing.xl,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  waveformContainer: {
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  micButtonRecording: {
    backgroundColor: colors.destructive,
  },
  duration: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.mutedText,
    textAlign: 'center',
  },
  hint: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
    textAlign: 'center',
  },
  retryBlock: {
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  retryButton: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: 160,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
});
