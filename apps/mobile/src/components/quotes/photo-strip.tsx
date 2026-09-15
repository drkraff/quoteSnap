import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography, MIN_TOUCH_TARGET } from '../../theme/tokens';
import {
  ADD_PHOTO_LABEL,
  PHOTO_PRIVATE_HINT,
  photoDisplayUri,
  photoStatusLabel,
  type QuotePhoto,
} from '../../quotes/photos';

interface PhotoStripProps {
  photos: QuotePhoto[];
  onAdd?: () => void;
  addLabel?: string;
}

export function PhotoStrip({
  photos,
  onAdd,
  addLabel = ADD_PHOTO_LABEL,
}: PhotoStripProps): JSX.Element {
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {photos.map((photo) => {
          const uri = photoDisplayUri(photo);
          return (
            <View key={photo.id} style={styles.thumbWrap}>
              {uri ? (
                <Image
                  source={{ uri }}
                  style={styles.thumb}
                  accessibilityLabel="Job photo"
                />
              ) : (
                <View style={[styles.thumb, styles.placeholder]}>
                  <Text style={styles.placeholderText}>Photo</Text>
                </View>
              )}
              <Text style={styles.status} numberOfLines={1}>
                {photoStatusLabel(photo)}
              </Text>
            </View>
          );
        })}
        {onAdd ? (
          <Pressable
            onPress={onAdd}
            style={styles.addButton}
            accessibilityRole="button"
            accessibilityLabel={`${addLabel}. ${PHOTO_PRIVATE_HINT}`}
          >
            <Text style={styles.addText}>{addLabel}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {photos.length > 0 || onAdd ? (
        <Text style={styles.hint}>{PHOTO_PRIVATE_HINT}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  thumbWrap: {
    width: 72,
    alignItems: 'center',
    gap: 2,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: typography.label.fontSize,
    color: colors.mutedText,
  },
  status: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.mutedText,
    textAlign: 'center',
  },
  addButton: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: colors.accent,
  },
  hint: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
});
