import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Linking,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
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

type RecordingState = 'idle' | 'recording' | 'stopped';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function VoiceRecordScreen(): JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleStartRecording = useCallback(async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert(
          'Microphone Access Required',
          'Microphone access is required to record voice quotes. Open Settings to allow.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } },
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

      recordingRef.current = recording;
      setRecordingState('recording');
      setDurationSeconds(0);

      intervalRef.current = setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      Alert.alert('Recording Error', 'Failed to start recording. Please try again.');
    }
  }, []);

  const handleStopRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) {
        throw new Error('No recording URI available');
      }

      // VOICE-02: Move from cacheDirectory to documentDirectory immediately
      const dest = `${FileSystem.documentDirectory ?? ''}audio-${Date.now()}.m4a`;
      await FileSystem.moveAsync({ from: uri, to: dest });

      // Reset audio mode
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      // Create local quote + draft in WatermelonDB
      const contractorId = useAuthStore.getState().contractor?.id ?? '';
      let newQuoteId = '';
      await database.write(async () => {
        const newQuote = await database.get<Quote>('quotes').create((r) => {
          r.contractorId = contractorId;
          r.status = 'ai_processing';
          r.totalCents = 0;
        });
        newQuoteId = newQuote.id;
        await database.get<Draft>('drafts').create((r) => {
          r.quoteId = newQuote.id;
          r.lineItemsJson = '[]';
        });
      });

      // Enqueue audio for sync
      await enqueue({
        entityType: 'audio',
        entityId: newQuoteId,
        action: 'create',
        payload: { filePath: dest, quoteLocalId: newQuoteId },
      });

      setRecordingState('stopped');
      router.back();
    } catch (error) {
      Alert.alert('Recording Error', 'Failed to save recording. Please try again.');
      setRecordingState('idle');
    }
  }, [router]);

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
});
