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
  previewImportedQuotes,
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
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handlePickPhotos(): Promise<void> {
    const picked = await pickOldQuoteImages(
      ImagePicker as unknown as ImageLibraryPicker,
      files.length,
    );
    if (!picked.ok) {
      if (picked.reason === PHOTO_PERMISSION_DENIED) {
        setStatus('Could not open photos. Paste the lines instead, or skip and quote with blanks.');
      }
      return;
    }
    const next = mergePickedOldQuoteFiles(files, picked.files);
    setFiles(next);
    if (oldQuoteFilesNeedPaste(next)) {
      setStatus(IMPORT_PHOTO_HINT);
    }
  }

  async function handleImport(): Promise<void> {
    setBusy(true);
    const preview = previewImportedQuotes({ text, trade, files });
    try {
      const parsed = parseImportedQuoteText(text);
      if (parsed.lines.length === 0) {
        setStatus(preview.message);
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
        setStatus(result.message);
      } catch {
        for (const item of importedLineQueueItems(parsed.lines, trade)) {
          await enqueue(item);
        }
        setStatus(preview.message);
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
          (busy || (text.trim() === '' && files.length === 0)) && styles.ctaDisabled,
          pressed && styles.pressed,
        ]}
        onPress={() => {
          void handleImport();
        }}
        disabled={busy || (text.trim() === '' && files.length === 0)}
        accessibilityRole="button"
        accessibilityLabel={IMPORT_CTA_LABEL}
        accessibilityState={{ disabled: busy || (text.trim() === '' && files.length === 0) }}
      >
        {busy ? (
          <ActivityIndicator color="#ffffff" accessibilityLabel="Importing" />
        ) : (
          <Text style={styles.ctaText}>{IMPORT_CTA_LABEL}</Text>
        )}
      </Pressable>
      {status ? <Text style={styles.status}>{status}</Text> : null}
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
  status: {
    marginTop: spacing.md,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    color: colors.mutedText,
  },
  pressed: {
    opacity: 0.85,
  },
});
