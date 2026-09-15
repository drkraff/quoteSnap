import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../theme/tokens';
import { enqueue } from '../../sync/sync-queue';
import { importRateCardFromText } from '../../api/rate-card';
import { parseImportedQuoteText } from '../../rate-card/import-parse';
import {
  IMPORT_CTA_LABEL,
  IMPORT_OCR_STUB_HEADING,
  IMPORT_OLD_QUOTES_BODY,
  IMPORT_OLD_QUOTES_TITLE,
  IMPORT_PHOTO_HINT,
  IMPORT_PICK_PHOTOS_LABEL,
  IMPORT_PLACEHOLDER,
} from '../../rate-card/import-copy';
import {
  mergePickedOldQuoteFiles,
  oldQuoteFilesNeedPaste,
  PHOTO_PERMISSION_DENIED,
  pickOldQuoteImages,
  type ImageLibraryPicker,
  type OldQuotePickedFile,
} from '../../rate-card/import-files';
import {
  importedLineQueueItems,
  importFeedbackView,
  previewImportedQuotes,
  type ImportFeedbackView,
} from '../../rate-card/import-apply';

type ImportOldQuotesFormProps = {
  trade?: string | null;
  skipLabel: string;
  onSkip: () => void;
};

export function ImportOldQuotesForm({
  trade,
  skipLabel,
  onSkip,
}: ImportOldQuotesFormProps): JSX.Element {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<OldQuotePickedFile[]>([]);
  const [feedback, setFeedback] = useState<ImportFeedbackView | null>(null);
  const [busy, setBusy] = useState(false);

  const photosNeedPaste = files.length > 0 && oldQuoteFilesNeedPaste(files);

  async function handlePickPhotos(): Promise<void> {
    const picked = await pickOldQuoteImages(
      ImagePicker as unknown as ImageLibraryPicker,
      files.length,
    );
    if (!picked.ok) {
      if (picked.reason === PHOTO_PERMISSION_DENIED) {
        setFeedback({
          heading: 'Could not open photos',
          body: 'Paste the lines instead, or skip and quote with blanks.',
          skippedLabels: [],
          tone: 'calm',
        });
      }
      return;
    }
    const next = mergePickedOldQuoteFiles(files, picked.files);
    setFiles(next);
    if (oldQuoteFilesNeedPaste(next)) {
      setFeedback({
        heading: IMPORT_OCR_STUB_HEADING,
        body: IMPORT_PHOTO_HINT,
        skippedLabels: [],
        tone: 'calm',
      });
    }
  }

  async function handleImport(): Promise<void> {
    setBusy(true);
    const preview = previewImportedQuotes({ text, trade, files });
    try {
      const parsed = parseImportedQuoteText(text);
      if (parsed.lines.length === 0) {
        setFeedback(importFeedbackView(preview));
        return;
      }
      try {
        const result = await importRateCardFromText({
          text,
          trade: trade ?? undefined,
          documents: files.map((file) => ({
            filename: file.filename,
            mime: file.mime,
          })),
        });
        setFeedback(
          importFeedbackView({
            ...preview,
            imported: result.imported,
            skipped: result.skipped,
            message: result.message,
          }),
        );
      } catch {
        for (const item of importedLineQueueItems(parsed.lines, trade)) {
          await enqueue(item);
        }
        setFeedback(importFeedbackView(preview));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Text style={styles.heading}>{IMPORT_OLD_QUOTES_TITLE}</Text>
      <Text style={styles.body}>{IMPORT_OLD_QUOTES_BODY}</Text>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={IMPORT_PLACEHOLDER}
        multiline
        textAlignVertical="top"
        accessibilityLabel="Paste lines from an old quote"
      />
      {files.length > 0 ? (
        <Text style={styles.fileList}>
          {files.map((file) => file.filename).join(', ')}
        </Text>
      ) : null}
      {photosNeedPaste ? (
        <Text style={styles.photoHint}>{IMPORT_PHOTO_HINT}</Text>
      ) : null}
      <Pressable
        style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        onPress={() => {
          void handlePickPhotos();
        }}
        accessibilityRole="button"
        accessibilityLabel={IMPORT_PICK_PHOTOS_LABEL}
      >
        <Text style={styles.secondaryText}>{IMPORT_PICK_PHOTOS_LABEL}</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          styles.cta,
          busy && styles.ctaDisabled,
          pressed && styles.pressed,
        ]}
        onPress={() => {
          void handleImport();
        }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={IMPORT_CTA_LABEL}
        accessibilityState={{ disabled: busy }}
      >
        {busy ? (
          <ActivityIndicator color="#ffffff" accessibilityLabel="Importing" />
        ) : (
          <Text style={styles.ctaText}>{IMPORT_CTA_LABEL}</Text>
        )}
      </Pressable>
      {feedback ? (
        <View
          style={[
            styles.feedback,
            feedback.tone === 'review' ? styles.feedbackReview : styles.feedbackCalm,
          ]}
          accessibilityRole="summary"
          accessibilityLabel={feedback.heading}
        >
          <Text style={styles.feedbackHeading}>{feedback.heading}</Text>
          <Text style={styles.feedbackBody}>{feedback.body}</Text>
          {feedback.skippedLabels.length > 0 ? (
            <View style={styles.skippedList}>
              {feedback.skippedLabels.map((label, index) => (
                <Text key={`${index}-${label}`} style={styles.skippedLine}>
                  {`• ${label}`}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      <Pressable
        style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
        onPress={onSkip}
        accessibilityRole="button"
        accessibilityLabel={skipLabel}
      >
        <Text style={styles.skipText}>{skipLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: typography.heading.fontSize,
    fontWeight: typography.heading.fontWeight,
    lineHeight: typography.heading.lineHeight,
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.mutedText,
    marginBottom: spacing.md,
  },
  input: {
    minHeight: 160,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    fontSize: typography.body.fontSize,
    marginBottom: spacing.sm,
  },
  fileList: {
    fontSize: typography.label.fontSize,
    color: colors.mutedText,
    marginBottom: spacing.xs,
  },
  photoHint: {
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
    marginBottom: spacing.sm,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    color: '#ffffff',
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
  secondary: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: colors.accent,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
  skip: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  skipText: {
    color: colors.mutedText,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
  feedback: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
  },
  feedbackCalm: {
    backgroundColor: colors.secondary,
    borderColor: colors.border,
  },
  feedbackReview: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  feedbackHeading: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
  },
  feedbackBody: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  skippedList: {
    gap: spacing.xs,
  },
  skippedLine: {
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  pressed: {
    opacity: 0.85,
  },
});
