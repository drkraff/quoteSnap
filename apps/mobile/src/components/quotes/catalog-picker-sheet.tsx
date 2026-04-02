import {
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';

interface CatalogItem {
  id: string;
  name: string;
  unitPriceCents: number;
}

interface CatalogPickerSheetProps {
  visible: boolean;
  items: CatalogItem[];
  onSelect: (item: CatalogItem) => void;
  onDismiss: () => void;
}

export function CatalogPickerSheet({
  visible,
  items,
  onSelect,
  onDismiss,
}: CatalogPickerSheetProps): JSX.Element {
  const screenHeight = Dimensions.get('window').height;

  function renderItem({ item }: { item: CatalogItem }): JSX.Element {
    const priceDisplay = `$${(item.unitPriceCents / 100).toFixed(2)}`;
    return (
      <Pressable
        style={({ pressed }) => [styles.itemRow, pressed && styles.itemRowPressed]}
        onPress={() => {
          onSelect(item);
          onDismiss();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Add ${item.name}, ${priceDisplay}`}
      >
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemPrice}>{priceDisplay}</Text>
      </Pressable>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { maxHeight: screenHeight * 0.6 }]}>
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Title */}
          <Text style={styles.title}>Add Item</Text>

          {/* Items list or empty state */}
          {items.length === 0 ? (
            <Text style={styles.emptyText}>No catalog items available</Text>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.dominant,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  handle: {
    width: 32,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.heading.fontSize,
    fontWeight: typography.heading.fontWeight,
    lineHeight: typography.heading.lineHeight,
    color: '#000000',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.dominant,
  },
  itemRowPressed: {
    backgroundColor: colors.secondary,
  },
  itemName: {
    flex: 1,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: '#000000',
    marginRight: spacing.sm,
  },
  itemPrice: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.mutedText,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  emptyText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.mutedText,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
