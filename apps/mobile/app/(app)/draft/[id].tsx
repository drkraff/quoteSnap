import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { confidenceTier } from '../../../src/utils/confidence';
import { useLocalSearchParams } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { database } from '../../../src/db';
import { Quote } from '../../../src/db/models/quote';
import { Draft } from '../../../src/db/models/draft';
import { CatalogItem } from '../../../src/db/models/catalog-item';
import {
  LineItem,
  parseLineItems,
  addItem,
  removeItem,
  updateQuantity,
  updatePrice,
  recalculateTotal,
  serializeLineItems,
} from '../../../src/utils/line-items';
import { canSend } from '../../../src/utils/quote-validation';
import { enqueue } from '../../../src/sync/sync-queue';
import { useAuthStore } from '../../../src/store/auth-store';
import { LineItemRow } from '../../../src/components/quotes/line-item-row';
import { PriceEditSheet } from '../../../src/components/quotes/price-edit-sheet';
import { CatalogPickerSheet } from '../../../src/components/quotes/catalog-picker-sheet';
import { EmptyState } from '../../../src/components/catalog/empty-state';
import { UndoToast } from '../../../src/components/catalog/undo-toast';
import { colors, spacing, typography } from '../../../src/theme/tokens';

export default function DraftScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [phone, setPhone] = useState('');
  const [priceEditIndex, setPriceEditIndex] = useState<number | null>(null);
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [validationError, setValidationError] = useState('');
  const [undoItem, setUndoItem] = useState<{ item: LineItem; index: number } | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const [loading, setLoading] = useState(true);

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Load quote + draft on mount
  useEffect(() => {
    async function load(): Promise<void> {
      const q = await database.get<Quote>('quotes').find(id);
      setQuote(q);
      setPhone(q.customerPhone ?? '');
      const drafts = await database
        .get<Draft>('drafts')
        .query(Q.where('quote_id', id))
        .fetch();
      if (drafts[0]) {
        setDraft(drafts[0]);
        setLineItems(parseLineItems(drafts[0].lineItemsJson));
      }
      setLoading(false);
    }
    void load();
  }, [id]);

  // Subscribe to draft changes
  useEffect(() => {
    if (!draft) return;
    const sub = draft.observe().subscribe((updated) => {
      setLineItems(parseLineItems(updated.lineItemsJson));
    });
    return () => sub.unsubscribe();
  }, [draft]);

  // Load active catalog items for the picker
  useEffect(() => {
    const contractorId = useAuthStore.getState().contractor?.id ?? '';
    const sub = database
      .get<CatalogItem>('catalog_items')
      .query(Q.where('contractor_id', contractorId), Q.where('is_archived', false))
      .observe()
      .subscribe(setCatalogItems);
    return () => sub.unsubscribe();
  }, []);

  // Auto-scroll to first red (needs_input) item on draft load
  useEffect(() => {
    if (lineItems.length === 0) return;
    const firstRedIndex = lineItems.findIndex(
      (item) => confidenceTier(item.confidence) === 'needs_input',
    );
    if (firstRedIndex > 0) {
      const timer = setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({
            index: firstRedIndex,
            animated: true,
            viewPosition: 0.3,
          });
        } catch {
          // FlatList may not have measured — fallback silently
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineItems.length]); // Only on initial load, not every edit

  // Clean up undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  async function handleQuantityChange(index: number, delta: number): Promise<void> {
    if (!draft || !quote) return;
    const newItems = updateQuantity(lineItems, index, delta);
    const newTotal = recalculateTotal(newItems);
    await database.write(async () => {
      await draft.update((r) => {
        r.lineItemsJson = serializeLineItems(newItems);
      });
      await quote.update((r) => {
        r.totalCents = newTotal;
      });
    });
    await enqueue({
      entityType: 'draft',
      entityId: draft.id,
      action: 'update',
      payload: { lineItemsJson: serializeLineItems(newItems), totalCents: newTotal },
    });
  }

  async function handlePriceSave(newPriceCents: number): Promise<void> {
    if (!draft || !quote || priceEditIndex === null) return;
    const newItems = updatePrice(lineItems, priceEditIndex, newPriceCents);
    const newTotal = recalculateTotal(newItems);
    await database.write(async () => {
      await draft.update((r) => {
        r.lineItemsJson = serializeLineItems(newItems);
      });
      await quote.update((r) => {
        r.totalCents = newTotal;
      });
    });
    await enqueue({
      entityType: 'draft',
      entityId: draft.id,
      action: 'update',
      payload: { lineItemsJson: serializeLineItems(newItems), totalCents: newTotal },
    });
    setPriceEditIndex(null);
  }

  async function handleDeleteItem(index: number): Promise<void> {
    if (!draft || !quote) return;
    const deleted = lineItems[index];
    setUndoItem({ item: deleted, index });
    const newItems = removeItem(lineItems, index);
    const newTotal = recalculateTotal(newItems);
    await database.write(async () => {
      await draft.update((r) => {
        r.lineItemsJson = serializeLineItems(newItems);
      });
      await quote.update((r) => {
        r.totalCents = newTotal;
      });
    });
    await enqueue({
      entityType: 'draft',
      entityId: draft.id,
      action: 'update',
      payload: { lineItemsJson: serializeLineItems(newItems), totalCents: newTotal },
    });
    setShowUndo(true);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setShowUndo(false);
      setUndoItem(null);
    }, 4000);
  }

  async function handleUndoDelete(): Promise<void> {
    if (!undoItem || !draft || !quote) return;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    const restored = [...lineItems];
    restored.splice(undoItem.index, 0, undoItem.item);
    const newTotal = recalculateTotal(restored);
    await database.write(async () => {
      await draft.update((r) => {
        r.lineItemsJson = serializeLineItems(restored);
      });
      await quote.update((r) => {
        r.totalCents = newTotal;
      });
    });
    await enqueue({
      entityType: 'draft',
      entityId: draft.id,
      action: 'update',
      payload: { lineItemsJson: serializeLineItems(restored), totalCents: newTotal },
    });
    setShowUndo(false);
    setUndoItem(null);
  }

  async function handleAddItem(
    catalogItem: { id: string; name: string; unitPriceCents: number },
  ): Promise<void> {
    if (!draft || !quote) return;
    const newItems = addItem(lineItems, { id: catalogItem.id, name: catalogItem.name, unitPriceCents: catalogItem.unitPriceCents });
    const newTotal = recalculateTotal(newItems);
    await database.write(async () => {
      await draft.update((r) => {
        r.lineItemsJson = serializeLineItems(newItems);
      });
      await quote.update((r) => {
        r.totalCents = newTotal;
      });
    });
    await enqueue({
      entityType: 'draft',
      entityId: draft.id,
      action: 'update',
      payload: { lineItemsJson: serializeLineItems(newItems), totalCents: newTotal },
    });
    setShowCatalogPicker(false);
  }

  async function handlePhoneChange(text: string): Promise<void> {
    setPhone(text);
    setValidationError('');
    if (!quote) return;
    await database.write(async () => {
      await quote.update((r) => {
        r.customerPhone = text;
      });
    });
    await enqueue({
      entityType: 'quote',
      entityId: quote.id,
      action: 'update',
      payload: { customerPhone: text },
    });
  }

  async function handleSendPress(): Promise<void> {
    if (!quote || !draft) return;
    if (!canSend(lineItems.length, phone)) {
      if (lineItems.length === 0) {
        setValidationError('Add at least one item before sending');
      } else {
        setValidationError('Enter a valid phone number to continue');
      }
      return;
    }
    await database.write(async () => {
      await quote.update((r) => {
        r.status = 'draft_queued';
      });
    });
    await enqueue({
      entityType: 'quote',
      entityId: quote.id,
      action: 'update',
      payload: {
        status: 'draft_queued',
        customerPhone: phone,
        totalCents: recalculateTotal(lineItems),
        lineItems: lineItems.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPriceCents: i.unitPriceCents,
        })),
      },
    });
    // Phase 6 wires the actual SMS send — this queues the action
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const sendEnabled = canSend(lineItems.length, phone);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <FlatList
        ref={flatListRef}
        data={lineItems}
        keyExtractor={(_, index) => String(index)}
        renderItem={({ item, index }) => {
          const tier = confidenceTier(item.confidence);
          const displayTier = tier === 'clean' ? undefined : tier;
          return (
            <LineItemRow
              name={item.name}
              quantity={item.quantity}
              unitPriceCents={item.unitPriceCents}
              confidence={displayTier}
              onQuantityChange={(delta) => { void handleQuantityChange(index, delta); }}
              onPricePress={() => setPriceEditIndex(index)}
              onDelete={() => { void handleDeleteItem(index); }}
            />
          );
        }}
        onScrollToIndexFailed={(info) => {
          const offset = info.averageItemLength * info.index;
          flatListRef.current?.scrollToOffset({ offset, animated: true });
        }}
        ListEmptyComponent={
          <EmptyState onAddItem={() => setShowCatalogPicker(true)} />
        }
        ListFooterComponent={
          <Pressable
            style={styles.addItemButton}
            onPress={() => setShowCatalogPicker(true)}
            accessibilityRole="button"
            accessibilityLabel="Add item from catalog"
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
            <Text style={styles.addItemText}>Add Item</Text>
          </Pressable>
        }
        contentContainerStyle={{ paddingBottom: 160 }}
      />

      {/* Sticky footer */}
      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <TextInput
          style={[styles.phoneInput, styles.phoneInputDefault]}
          keyboardType="phone-pad"
          placeholder="Customer phone number"
          placeholderTextColor={colors.mutedText}
          value={phone}
          onChangeText={(text) => { void handlePhoneChange(text); }}
          returnKeyType="done"
        />
        {validationError.length > 0 && (
          <Text style={styles.validationError}>{validationError}</Text>
        )}
        <Pressable
          style={[
            styles.sendButton,
            { backgroundColor: sendEnabled ? colors.accent : colors.secondary },
          ]}
          onPress={() => { void handleSendPress(); }}
          accessibilityLabel="Send quote to customer"
          accessibilityState={{ disabled: !sendEnabled }}
        >
          <Text
            style={[
              styles.sendButtonText,
              { color: sendEnabled ? '#ffffff' : colors.mutedText },
            ]}
          >
            Send Quote
          </Text>
        </Pressable>
      </View>

      <PriceEditSheet
        visible={priceEditIndex !== null}
        currentPriceCents={priceEditIndex !== null ? lineItems[priceEditIndex].unitPriceCents : 0}
        onSave={(newPrice) => { void handlePriceSave(newPrice); }}
        onDismiss={() => setPriceEditIndex(null)}
      />

      <CatalogPickerSheet
        visible={showCatalogPicker}
        items={catalogItems.map((c) => ({ id: c.id, name: c.name, unitPriceCents: c.unitPriceCents }))}
        onSelect={(item) => { void handleAddItem(item); }}
        onDismiss={() => setShowCatalogPicker(false)}
      />

      <UndoToast
        visible={showUndo}
        onUndo={() => { void handleUndoDelete(); }}
        onDismiss={() => {
          setShowUndo(false);
          setUndoItem(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dominant,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dominant,
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  addItemText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.accent,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.dominant,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  phoneInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
    fontSize: typography.body.fontSize,
    color: '#000000',
  },
  phoneInputDefault: {
    borderColor: colors.border,
  },
  validationError: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: colors.errorText,
  },
  sendButton: {
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
