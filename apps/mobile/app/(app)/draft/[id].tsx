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
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { createDraftPhoneSync } from '../../../src/quotes/draft-phone-sync';
import { QUOTE_NOT_FOUND, findQuoteRecord } from '../../../src/quotes/find-quote';
import { LineItemRow } from '../../../src/components/quotes/line-item-row';
import { PriceEditSheet } from '../../../src/components/quotes/price-edit-sheet';
import { CatalogPickerSheet } from '../../../src/components/quotes/catalog-picker-sheet';
import { EmptyState } from '../../../src/components/catalog/empty-state';
import { UndoToast } from '../../../src/components/catalog/undo-toast';
import { AiFailedBanner } from '../../../src/components/quotes/ai-failed-banner';
import { colors, spacing, typography } from '../../../src/theme/tokens';

export default function DraftScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteStatus, setQuoteStatus] = useState('');
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
  const [loadError, setLoadError] = useState('');

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const quoteRef = useRef<Quote | null>(null);
  const phoneWriteGen = useRef(0);
  const phoneSync = useRef(
    createDraftPhoneSync(async ({ quoteId, customerPhone }) => {
      await enqueue({
        entityType: 'quote',
        entityId: quoteId,
        action: 'update',
        payload: { customerPhone },
      });
    }),
  ).current;

  // Load quote + draft on mount. Voice/hydrate usually already wrote a draft;
  // create an empty one if missing so catalog add works on ai_failed quotes.
  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const found = await findQuoteRecord(() =>
        database.get<Quote>('quotes').find(id),
      );
      if (cancelled) return;
      if (!found.ok) {
        setLoadError(found.error);
        setLoading(false);
        return;
      }

      try {
        const q = found.record;
        quoteRef.current = q;
        phoneSync.markSynced({
          quoteId: q.id,
          customerPhone: q.customerPhone ?? '',
        });
        setQuote(q);
        setQuoteStatus(q.status);
        setPhone(q.customerPhone ?? '');
        const draftCollection = database.get<Draft>('drafts');
        const drafts = await draftCollection.query(Q.where('quote_id', id)).fetch();
        if (cancelled) return;
        if (drafts[0]) {
          setDraft(drafts[0]);
          setLineItems(parseLineItems(drafts[0].lineItemsJson));
        } else {
          let createdId = '';
          await database.write(async () => {
            const created = await draftCollection.create((r) => {
              r.quoteId = id;
              r.lineItemsJson = '[]';
            });
            createdId = created.id;
          });
          const created = await draftCollection.find(createdId);
          if (cancelled) return;
          setDraft(created);
          setLineItems([]);
        }
        setLoading(false);
      } catch {
        if (cancelled) return;
        setLoadError(QUOTE_NOT_FOUND);
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, phoneSync]);

  // Subscribe to quote status (ai_failed → draft_local recovery)
  useEffect(() => {
    if (!quote) return;
    const sub = quote.observe().subscribe((updated) => {
      setQuoteStatus(updated.status);
    });
    return () => sub.unsubscribe();
  }, [quote]);

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

  // Clean up undo timer and flush a pending phone enqueue on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
      void phoneSync.flush();
    };
  }, [phoneSync]);

  /** Local + queued recovery so A-06 PUT can accept line items / send. */
  async function recoverFromAiFailed(): Promise<void> {
    if (!quote || quote.status !== 'ai_failed') return;
    await database.write(async () => {
      await quote.update((r) => {
        r.status = 'draft_local';
      });
    });
    setQuoteStatus('draft_local');
    await enqueue({
      entityType: 'quote',
      entityId: quote.id,
      action: 'update',
      payload: { status: 'draft_local' },
    });
  }

  async function handleQuantityChange(index: number, delta: number): Promise<void> {
    if (!draft || !quote) return;
    await recoverFromAiFailed();
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
    await recoverFromAiFailed();
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
    await recoverFromAiFailed();
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
    await recoverFromAiFailed();
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

  async function persistPhoneLocal(q: Quote, text: string): Promise<void> {
    const gen = ++phoneWriteGen.current;
    await database.write(async () => {
      if (gen !== phoneWriteGen.current) return;
      await q.update((r) => {
        r.customerPhone = text;
      });
    });
  }

  function handlePhoneChange(text: string): void {
    setPhone(text);
    setValidationError('');
    const q = quoteRef.current;
    if (!q) return;
    void persistPhoneLocal(q, text);
    phoneSync.schedule({ quoteId: q.id, customerPhone: text });
  }

  async function handleSendPress(): Promise<void> {
    await phoneSync.flush();
    if (!quote || !draft) {
      setValidationError('Draft not loaded — please go back and try again');
      return;
    }
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
    // Phase 6 wires the actual SMS send — navigate back to quotes list
    router.back();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (loadError || !quote) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{loadError || QUOTE_NOT_FOUND}</Text>
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
        ListHeaderComponent={
          quoteStatus === 'ai_failed' ? (
            <AiFailedBanner
              onRerecord={() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                router.push('/voice-record' as any);
              }}
              onAddItems={() => setShowCatalogPicker(true)}
            />
          ) : null
        }
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
          onChangeText={handlePhoneChange}
          onBlur={() => { void phoneSync.flush(); }}
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
    padding: spacing.xl,
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
  errorText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.mutedText,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
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
