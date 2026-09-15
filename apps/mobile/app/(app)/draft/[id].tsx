import { useState, useEffect, useRef, useCallback } from 'react';
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
  Alert,
  Linking,
} from 'react-native';
import { confidenceTier } from '../../../src/utils/confidence';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
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
  addAlternate,
  removeItem,
  updateQuantity,
  updatePrice,
  updatePrivateNote,
  recalculateTotal,
  serializeLineItems,
  isUnknownUnitPrice,
  selectOptionForTotal,
} from '../../../src/utils/line-items';
import { canSend } from '../../../src/utils/quote-validation';
import { enqueue } from '../../../src/sync/sync-queue';
import { buildRateCardLearnPayload, rateCardQueueEntityId } from '../../../src/rate-card/learn';
import { isOnline } from '../../../src/sync/network-monitor';
import {
  REVIEW_BEFORE_SENDING,
  comparableLineItems,
  sendBlockedByReview,
} from '../../../src/sync/draft-conflict';
import { fetchAndResolveDraftFork } from '../../../src/sync/draft-conflict-sync';
import { FROZEN_QUOTE_WRITE_MESSAGE, isFrozenQuoteStatus } from '../../../src/sync/frozen-quote';
import {
  acknowledgeDraftReview,
  isNeedsReviewForDraft,
} from '../../../src/sync/draft-conflict-queue';
import { SyncQueueItem } from '../../../src/db/models/sync-queue-item';
import { useAuthStore } from '../../../src/store/auth-store';
import { createDraftPhoneSync, createLatestDebouncer, PHONE_SYNC_DEBOUNCE_MS } from '../../../src/quotes/draft-phone-sync';
import { QUOTE_NOT_FOUND, findQuoteRecord } from '../../../src/quotes/find-quote';
import { LineItemRow } from '../../../src/components/quotes/line-item-row';
import { PriceEditSheet } from '../../../src/components/quotes/price-edit-sheet';
import { CatalogPickerSheet } from '../../../src/components/quotes/catalog-picker-sheet';
import { AlternateOptionSheet } from '../../../src/components/quotes/alternate-option-sheet';
import { PrivateNoteField } from '../../../src/components/quotes/private-note-field';
import { ClientSentenceField } from '../../../src/components/quotes/client-sentence-field';
import { PrivateNoteSheet } from '../../../src/components/quotes/private-note-sheet';
import { PhotoStrip } from '../../../src/components/quotes/photo-strip';
import { EmptyState } from '../../../src/components/catalog/empty-state';
import { UndoToast } from '../../../src/components/catalog/undo-toast';
import { AiFailedBanner } from '../../../src/components/quotes/ai-failed-banner';
import { ReviewBeforeSendingBanner } from '../../../src/components/quotes/review-before-sending-banner';
import { aiFailedRecoveryView } from '../../../src/quotes/ai-failed-recovery';
import { retryVoiceQuotePlan } from '../../../src/quotes/retry-voice-quote';
import { localVoiceAudioPath } from '../../../src/quotes/voice-audio';
import {
  LINE_PRIVATE_NOTE_ADD,
  PRIVATE_NOTE_INTERNAL_HINT,
  normalizePrivateNote,
} from '../../../src/quotes/private-notes';
import { normalizeClientSentence } from '../../../src/quotes/client-sentence';
import { toContractorLineItemSync } from '../../../src/quotes/customer-payload';
import {
  SHARE_QUOTE_EMPTY,
  SHARE_QUOTE_LABEL,
  shareCustomerQuote,
} from '../../../src/quotes/share-customer-quote';
import {
  ADD_ALTERNATE_LABEL,
  OPTION_ALTERNATE_LABEL,
  OPTION_IN_TOTAL_LABEL,
  OPTION_USE_FOR_TOTAL_LABEL,
} from '../../../src/quotes/option-groups';
import {
  ADD_ROOM_LABEL,
  ADD_ROOM_PLACEHOLDER,
  ROOM_ADD_ITEM_LABEL,
  ROOM_MOVE_LABEL,
  ROOM_NOTE_ADD,
  ROOM_UNGROUPED_CHOICE,
  UNGROUPED_ROOM_LABEL,
  addRoom,
  assignLineRoom,
  draftListRows,
  parseRoomsJson,
  rowIndexForLineIndex,
  serializeRooms,
  updateRoomPrivateNote,
  type QuoteRoom,
} from '../../../src/quotes/rooms';
import {
  ADD_PHOTO_LABEL,
  PHOTO_CAMERA_LABEL,
  PHOTO_LIBRARY_LABEL,
  PHOTO_PRIVATE_HINT,
  addPhoto,
  ensureLineClientId,
  parsePhotosJson,
  photosForLine,
  photosForQuote,
  photosForRoom,
  serializePhotos,
  type QuotePhoto,
} from '../../../src/quotes/photos';
import { persistStillPlan, photoQueuePayload } from '../../../src/quotes/persist-photo';
import { typedPriceSource } from '../../../src/utils/price-source';
import { colors, spacing, typography } from '../../../src/theme/tokens';
import { RESUME_KIND_DRAFT } from '../../../src/quotes/resume-checkpoint';
import {
  clearResumeCheckpoints,
  upsertResumeCheckpoint,
} from '../../../src/quotes/resume-checkpoint-store';

export default function DraftScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteStatus, setQuoteStatus] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [phone, setPhone] = useState('');
  const [privateNote, setPrivateNote] = useState('');
  const [clientSentence, setClientSentence] = useState('');
  const [rooms, setRooms] = useState<QuoteRoom[]>([]);
  const [photos, setPhotos] = useState<QuotePhoto[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [addToRoomId, setAddToRoomId] = useState<string | null>(null);
  const [roomPickerIndex, setRoomPickerIndex] = useState<number | null>(null);
  const [roomNoteId, setRoomNoteId] = useState<string | null>(null);
  const [priceEditIndex, setPriceEditIndex] = useState<number | null>(null);
  const [lineNoteIndex, setLineNoteIndex] = useState<number | null>(null);
  const [alternateForIndex, setAlternateForIndex] = useState<number | null>(null);
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [validationError, setValidationError] = useState('');
  const [undoItem, setUndoItem] = useState<{ item: LineItem; index: number } | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [needsReview, setNeedsReview] = useState(false);
  const [audioExists, setAudioExists] = useState(false);
  const [retryingVoice, setRetryingVoice] = useState(false);
  const [sharing, setSharing] = useState(false);

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
  const noteSync = useRef(
    createLatestDebouncer(async (value: { quoteId: string; privateNote: string | null }) => {
      await enqueue({
        entityType: 'quote',
        entityId: value.quoteId,
        action: 'update',
        payload: { privateNote: value.privateNote },
      });
    }, PHONE_SYNC_DEBOUNCE_MS),
  ).current;
  const sentenceSync = useRef(
    createLatestDebouncer(async (value: { quoteId: string; clientSentence: string | null }) => {
      await enqueue({
        entityType: 'quote',
        entityId: value.quoteId,
        action: 'update',
        payload: { clientSentence: value.clientSentence },
      });
    }, PHONE_SYNC_DEBOUNCE_MS),
  ).current;
  const roomsSync = useRef(
    createLatestDebouncer(async (value: { quoteId: string; rooms: QuoteRoom[] }) => {
      await enqueue({
        entityType: 'quote',
        entityId: value.quoteId,
        action: 'update',
        payload: { rooms: value.rooms },
      });
    }, PHONE_SYNC_DEBOUNCE_MS),
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
        setPrivateNote(q.privateNote ?? '');
        setClientSentence(q.clientSentence ?? '');
        setRooms(parseRoomsJson(q.roomsJson));
        setPhotos(parsePhotosJson(q.photosJson));
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

  useFocusEffect(
    useCallback(() => {
      if (loading || loadError || !quote) {
        return;
      }
      const contractorId = useAuthStore.getState().contractor?.id ?? '';
      if (!contractorId) return;
      void upsertResumeCheckpoint({
        contractorId,
        kind: RESUME_KIND_DRAFT,
        quoteId: quote.id,
      }).catch(() => {
        // FAIL-07 must not block editing.
      });
      return () => {
        void clearResumeCheckpoints(contractorId, RESUME_KIND_DRAFT).catch(() => {
          // Leaving the editor must not throw.
        });
      };
    }, [loading, loadError, quote]),
  );

  useEffect(() => {
    let cancelled = false;
    const path = localVoiceAudioPath(id, FileSystem.documentDirectory);
    void FileSystem.getInfoAsync(path)
      .then((info) => {
        if (!cancelled) setAudioExists(info.exists === true);
      })
      .catch(() => {
        if (!cancelled) setAudioExists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

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

  // SYNC-05: live needs_review flag for this draft
  useEffect(() => {
    if (!draft) return;
    const sub = database
      .get<SyncQueueItem>('sync_queue_items')
      .query()
      .observe()
      .subscribe((items) => {
        setNeedsReview(items.some((item) => isNeedsReviewForDraft(item, draft.id)));
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
      (item) =>
        isUnknownUnitPrice(item.unitPriceCents) ||
        confidenceTier(item.confidence) === 'needs_input',
    );
    if (firstRedIndex > 0) {
      const rows = draftListRows(rooms, lineItems);
      const rowIndex = rowIndexForLineIndex(rows, firstRedIndex);
      const timer = setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({
            index: rowIndex >= 0 ? rowIndex : firstRedIndex,
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
      void sentenceSync.flush();
      void roomsSync.flush();
    };
  }, [phoneSync, noteSync, sentenceSync, roomsSync]);

  function rejectFrozenMoneyWrite(): boolean {
    const status = quote?.status ?? quoteStatus;
    if (!isFrozenQuoteStatus(status)) return false;
    setValidationError(FROZEN_QUOTE_WRITE_MESSAGE);
    return true;
  }

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

  async function handleRetryVoice(): Promise<void> {
    if (!quote || retryingVoice) return;
    const filePath = localVoiceAudioPath(quote.id, FileSystem.documentDirectory);
    const plan = retryVoiceQuotePlan({
      quoteId: quote.id,
      status: quote.status,
      filePath,
      audioExists,
    });
    if (!plan.ok) {
      Alert.alert('Retry unavailable', 'The original recording is no longer on this device.');
      return;
    }
    setRetryingVoice(true);
    try {
      await database.write(async () => {
        await quote.update((r) => {
          r.status = plan.nextStatus;
          r.voiceJobId = null;
        });
      });
      await enqueue(plan.enqueue);
      router.back();
    } catch {
      setRetryingVoice(false);
      Alert.alert('Retry failed', 'Could not re-queue this recording. Try again or add items from your catalog.');
    }
  }

  async function persistLineItems(newItems: LineItem[]): Promise<void> {
    if (!draft || !quote) return;
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

  async function handleQuantityChange(index: number, delta: number): Promise<void> {
    if (!draft || !quote) return;
    if (rejectFrozenMoneyWrite()) return;
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
    if (rejectFrozenMoneyWrite()) return;
    const pricedLine = lineItems[priceEditIndex];
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
    const learned = buildRateCardLearnPayload(
      {
        name: pricedLine.name,
        unitPriceCents: newPriceCents,
        catalogItemId: pricedLine.catalogItemId,
        unit: pricedLine.unit ?? undefined,
        trade: useAuthStore.getState().contractor?.trade,
      },
      catalogItems,
    );
    if (learned) {
      await enqueue({
        entityType: 'rate_card',
        entityId: rateCardQueueEntityId(learned),
        action: 'update',
        payload: learned,
      });
    }
    setPriceEditIndex(null);
  }

  async function handleDeleteItem(index: number): Promise<void> {
    if (!draft || !quote) return;
    if (rejectFrozenMoneyWrite()) return;
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
    if (rejectFrozenMoneyWrite()) return;
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
    if (rejectFrozenMoneyWrite()) return;
    await recoverFromAiFailed();
    const newItems = addItem(lineItems, {
      id: catalogItem.id,
      name: catalogItem.name,
      unitPriceCents: catalogItem.unitPriceCents,
      unit: catalogItems.find((c) => c.id === catalogItem.id)?.unit,
    }, addToRoomId);
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
    setAddToRoomId(null);
  }

  function handlePrivateNoteChange(text: string): void {
    setPrivateNote(text);
    const q = quoteRef.current;
    if (!q) return;
    void persistPrivateNoteLocal(q, text);
    noteSync.schedule({ quoteId: q.id, privateNote: normalizePrivateNote(text) });
  }

  async function persistPrivateNoteLocal(q: Quote, text: string): Promise<void> {
    await database.write(async () => {
      await q.update((r) => {
        r.privateNote = normalizePrivateNote(text);
      });
    });
  }

  function handleClientSentenceChange(text: string): void {
    setClientSentence(text);
    const q = quoteRef.current;
    if (!q) return;
    void persistClientSentenceLocal(q, text);
    sentenceSync.schedule({ quoteId: q.id, clientSentence: normalizeClientSentence(text) });
  }

  async function persistClientSentenceLocal(q: Quote, text: string): Promise<void> {
    await database.write(async () => {
      await q.update((r) => {
        r.clientSentence = normalizeClientSentence(text);
      });
    });
  }

  async function persistRooms(next: QuoteRoom[]): Promise<void> {
    if (!quote) return;
    setRooms(next);
    await database.write(async () => {
      await quote.update((r) => {
        r.roomsJson = serializeRooms(next);
      });
    });
    roomsSync.schedule({ quoteId: quote.id, rooms: next });
  }

  async function persistPhotos(next: QuotePhoto[]): Promise<void> {
    if (!quote) return;
    setPhotos(next);
    await database.write(async () => {
      await quote.update((r) => {
        r.photosJson = serializePhotos(next);
      });
    });
  }

  async function handleAddPhoto(target: {
    roomId?: string | null;
    lineIndex?: number;
  }): Promise<void> {
    if (!quote || !draft) return;
    if (rejectFrozenMoneyWrite()) return;
    await recoverFromAiFailed();

    Alert.alert(ADD_PHOTO_LABEL, PHOTO_PRIVATE_HINT, [
      {
        text: PHOTO_CAMERA_LABEL,
        onPress: () => { void pickAndAttachPhoto('camera', target); },
      },
      {
        text: PHOTO_LIBRARY_LABEL,
        onPress: () => { void pickAndAttachPhoto('library', target); },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function pickAndAttachPhoto(
    source: 'camera' | 'library',
    target: { roomId?: string | null; lineIndex?: number },
  ): Promise<void> {
    if (!quote || !draft) return;
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Photo access needed',
          'QuoteSnap needs camera or library access to attach job photos.',
          [
            { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
        return;
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.7,
              exif: false,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.7,
              exif: false,
            });
      if (result.canceled || !result.assets[0]?.uri) {
        return;
      }
      const asset = result.assets[0];
      const plan = persistStillPlan(
        { uri: asset.uri, mimeType: asset.mimeType },
        quote.id,
        FileSystem.documentDirectory,
      );
      await FileSystem.makeDirectoryAsync(plan.destDir, { intermediates: true });
      await FileSystem.copyAsync({ from: plan.sourceUri, to: plan.destUri });

      let nextItems = lineItems;
      let lineClientId: string | null = null;
      if (target.lineIndex != null) {
        nextItems = ensureLineClientId(lineItems, target.lineIndex);
        lineClientId = nextItems[target.lineIndex]?.clientId ?? null;
        if (nextItems !== lineItems) {
          await persistLineItems(nextItems);
        }
      }
      const nextPhotos = addPhoto(photos, {
        id: plan.photoId,
        localUri: plan.destUri,
        mime: plan.mime,
        roomId: target.roomId ?? null,
        lineClientId,
      });
      await persistPhotos(nextPhotos);
      await enqueue(photoQueuePayload({
        quoteLocalId: quote.id,
        photoId: plan.photoId,
        filePath: plan.destUri,
        mime: plan.mime,
      }));
    } catch {
      Alert.alert('Could not attach photo', 'The still was not saved. Try again.');
    }
  }

  async function handleAddRoom(): Promise<void> {
    if (!quote) return;
    if (rejectFrozenMoneyWrite()) return;
    await recoverFromAiFailed();
    const next = addRoom(rooms, newRoomName);
    if (next === rooms) return;
    setNewRoomName('');
    await persistRooms(next);
  }

  async function handleAssignRoom(index: number, roomId: string | null): Promise<void> {
    if (!draft || !quote) return;
    if (rejectFrozenMoneyWrite()) return;
    await recoverFromAiFailed();
    const newItems = assignLineRoom(lineItems, index, roomId);
    await persistLineItems(newItems);
    setRoomPickerIndex(null);
  }

  async function handleRoomNoteSave(raw: string | null): Promise<void> {
    if (!quote || roomNoteId === null) return;
    if (rejectFrozenMoneyWrite()) return;
    await recoverFromAiFailed();
    const next = updateRoomPrivateNote(rooms, roomNoteId, normalizePrivateNote(raw));
    await persistRooms(next);
    setRoomNoteId(null);
  }

  async function handleLineNoteSave(raw: string | null): Promise<void> {
    if (!draft || !quote || lineNoteIndex === null) return;
    if (rejectFrozenMoneyWrite()) return;
    await recoverFromAiFailed();
    const newItems = updatePrivateNote(
      lineItems,
      lineNoteIndex,
      normalizePrivateNote(raw),
    );
    await database.write(async () => {
      await draft.update((r) => {
        r.lineItemsJson = serializeLineItems(newItems);
      });
    });
    await enqueue({
      entityType: 'draft',
      entityId: draft.id,
      action: 'update',
      payload: { lineItemsJson: serializeLineItems(newItems), totalCents: recalculateTotal(newItems) },
    });
    setLineNoteIndex(null);
  }

  async function handleAddAlternate(raw: {
    name: string;
    unitPriceCents: number | null;
  }): Promise<void> {
    if (!draft || !quote || alternateForIndex === null) return;
    if (rejectFrozenMoneyWrite()) return;
    await recoverFromAiFailed();
    const newItems = addAlternate(lineItems, alternateForIndex, {
      name: raw.name,
      unitPriceCents: raw.unitPriceCents,
      priceSource:
        raw.unitPriceCents == null || raw.unitPriceCents === 0
          ? 'unknown'
          : typedPriceSource(raw.unitPriceCents),
    });
    await persistLineItems(newItems);
    setAlternateForIndex(null);
  }

  async function handleSelectOption(index: number): Promise<void> {
    if (!draft || !quote) return;
    if (rejectFrozenMoneyWrite()) return;
    await recoverFromAiFailed();
    const newItems = selectOptionForTotal(lineItems, index);
    await persistLineItems(newItems);
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

  async function handleSharePress(): Promise<void> {
    if (sharing) return;
    const selectedCount = lineItems.filter((item) => item.optionRole !== 'alt').length;
    if (selectedCount < 1) {
      Alert.alert('Cannot share', SHARE_QUOTE_EMPTY);
      return;
    }
    setSharing(true);
    try {
      const contractor = useAuthStore.getState().contractor;
      const result = await shareCustomerQuote(
        {
          customerPhone: phone || null,
          totalCents: recalculateTotal(lineItems),
          clientSentence: normalizeClientSentence(clientSentence),
          privateNote: normalizePrivateNote(privateNote),
          rooms,
          photos,
          lineItems,
        },
        {
          displayName: contractor?.displayName,
          trade: contractor?.trade,
        },
      );
      if (!result.ok) {
        Alert.alert('Cannot share', result.message);
      }
    } finally {
      setSharing(false);
    }
  }

  async function handleSendPress(): Promise<void> {
    await phoneSync.flush();
    await noteSync.flush();
    await sentenceSync.flush();
    if (!quote || !draft) {
      setValidationError('Draft not loaded — please go back and try again');
      return;
    }
    if (sendBlockedByReview(needsReview)) {
      setValidationError(REVIEW_BEFORE_SENDING);
      return;
    }
    if (rejectFrozenMoneyWrite()) return;
    if (!canSend(lineItems.length, phone)) {
      if (lineItems.length === 0) {
        setValidationError('Add at least one item before sending');
      } else {
        setValidationError('Enter a valid phone number to continue');
      }
      return;
    }
    if (isOnline() && quote.serverId) {
      const outcome = await fetchAndResolveDraftFork({
        quote,
        draft,
        localLines: comparableLineItems(lineItems),
      });
      if (outcome === 'conflict') {
        setNeedsReview(true);
        setValidationError(REVIEW_BEFORE_SENDING);
        return;
      }
      if (outcome === 'frozen') {
        setValidationError(FROZEN_QUOTE_WRITE_MESSAGE);
        return;
      }
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
        // Contractor PUT may include private notes so they persist. Phase 6
        // SMS/PDF/approval MUST use toCustomerQuotePayload (allowlist).
        privateNote: normalizePrivateNote(privateNote),
        clientSentence: normalizeClientSentence(clientSentence),
        rooms,
        lineItems: lineItems.map(toContractorLineItemSync),
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

  const sendEnabled = canSend(lineItems.length, phone) && !needsReview;
  const totalDisplay = `$${(recalculateTotal(lineItems) / 100).toFixed(2)}`;
  const listRows = draftListRows(rooms, lineItems);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <FlatList
        ref={flatListRef}
        data={listRows}
        keyExtractor={(row, index) =>
          row.kind === 'line' ? `line-${row.index}` : `${row.kind}-${index}`
        }
        renderItem={({ item: row }) => {
          if (row.kind === 'room') {
            return (
              <View style={styles.roomHeader}>
                <Text style={styles.roomHeaderTitle}>{row.room.name}</Text>
                <View style={styles.roomHeaderActions}>
                  <Pressable
                    onPress={() => {
                      setAddToRoomId(row.room.id);
                      setShowCatalogPicker(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${ROOM_ADD_ITEM_LABEL} in ${row.room.name}`}
                    style={styles.roomHeaderButton}
                  >
                    <Text style={styles.roomHeaderButtonText}>{ROOM_ADD_ITEM_LABEL}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setRoomNoteId(row.room.id)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      row.room.privateNote
                        ? `Edit room note. ${PRIVATE_NOTE_INTERNAL_HINT}`
                        : `${ROOM_NOTE_ADD}. ${PRIVATE_NOTE_INTERNAL_HINT}`
                    }
                    style={styles.roomHeaderButton}
                  >
                    <Text style={styles.roomHeaderButtonText}>
                      {row.room.privateNote ? 'Room note' : ROOM_NOTE_ADD}
                    </Text>
                  </Pressable>
                </View>
                {row.room.privateNote ? (
                  <Text style={styles.lineNoteHint}>{row.room.privateNote}</Text>
                ) : null}
                <PhotoStrip
                  photos={photosForRoom(photos, row.room.id)}
                  onAdd={() => { void handleAddPhoto({ roomId: row.room.id }); }}
                />
              </View>
            );
          }
          if (row.kind === 'ungrouped') {
            return (
              <View style={styles.roomHeader}>
                <Text style={styles.roomHeaderTitle}>{UNGROUPED_ROOM_LABEL}</Text>
              </View>
            );
          }
          const item = row.item;
          const index = row.index;
          const priceUnknown = isUnknownUnitPrice(item.unitPriceCents);
          const tier = priceUnknown ? 'needs_input' : confidenceTier(item.confidence);
          const displayTier = tier === 'clean' ? undefined : tier;
          const paired = Boolean(item.optionGroupId);
          const isAlt = item.optionRole === 'alt';
          const assignedRoom = rooms.find((room) => room.id === item.roomId);
          return (
            <View style={isAlt ? styles.altBlock : undefined}>
              <LineItemRow
                name={item.name}
                quantity={item.quantity}
                unit={item.unit}
                unitPriceCents={item.unitPriceCents}
                confidence={displayTier}
                priceSource={item.priceSource}
                onQuantityChange={(delta) => { void handleQuantityChange(index, delta); }}
                onPricePress={() => setPriceEditIndex(index)}
                onDelete={() => { void handleDeleteItem(index); }}
              />
              {rooms.length > 0 ? (
                <View style={styles.roomAssign}>
                  <Pressable
                    onPress={() =>
                      setRoomPickerIndex(roomPickerIndex === index ? null : index)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${ROOM_MOVE_LABEL} ${item.name}`}
                    style={styles.roomAssignButton}
                  >
                    <Text style={styles.roomAssignText}>
                      {`${ROOM_MOVE_LABEL}: ${assignedRoom?.name ?? ROOM_UNGROUPED_CHOICE}`}
                    </Text>
                  </Pressable>
                  {roomPickerIndex === index ? (
                    <View style={styles.roomPicker}>
                      <Pressable
                        onPress={() => { void handleAssignRoom(index, null); }}
                        accessibilityRole="button"
                        accessibilityLabel={ROOM_UNGROUPED_CHOICE}
                        style={styles.roomPickerChoice}
                      >
                        <Text style={styles.roomPickerChoiceText}>{ROOM_UNGROUPED_CHOICE}</Text>
                      </Pressable>
                      {rooms.map((room) => (
                        <Pressable
                          key={room.id}
                          onPress={() => { void handleAssignRoom(index, room.id); }}
                          accessibilityRole="button"
                          accessibilityLabel={room.name}
                          style={styles.roomPickerChoice}
                        >
                          <Text style={styles.roomPickerChoiceText}>{room.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
              {paired ? (
                <View style={styles.optionRow}>
                  <Text style={[styles.optionBadge, isAlt && styles.optionBadgeAlt]}>
                    {isAlt ? OPTION_ALTERNATE_LABEL : OPTION_IN_TOTAL_LABEL}
                  </Text>
                  {isAlt ? (
                    <Pressable
                      onPress={() => { void handleSelectOption(index); }}
                      accessibilityRole="button"
                      accessibilityLabel={`${OPTION_USE_FOR_TOTAL_LABEL}. ${item.name}`}
                      style={styles.optionSelectButton}
                    >
                      <Text style={styles.optionSelectText}>{OPTION_USE_FOR_TOTAL_LABEL}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <Pressable
                  style={styles.optionAddButton}
                  onPress={() => setAlternateForIndex(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`${ADD_ALTERNATE_LABEL} for ${item.name}`}
                >
                  <Text style={styles.optionAddText}>{ADD_ALTERNATE_LABEL}</Text>
                </Pressable>
              )}
              <Pressable
                style={styles.lineNoteButton}
                onPress={() => setLineNoteIndex(index)}
                accessibilityRole="button"
                accessibilityLabel={
                  item.privateNote
                    ? `Edit private note. ${PRIVATE_NOTE_INTERNAL_HINT}`
                    : `${LINE_PRIVATE_NOTE_ADD}. ${PRIVATE_NOTE_INTERNAL_HINT}`
                }
              >
                <Text
                  style={[
                    styles.lineNoteText,
                    !item.privateNote && styles.lineNotePlaceholder,
                  ]}
                  numberOfLines={2}
                >
                  {item.privateNote || LINE_PRIVATE_NOTE_ADD}
                </Text>
                <Text style={styles.lineNoteHint}>{PRIVATE_NOTE_INTERNAL_HINT}</Text>
              </Pressable>
              <PhotoStrip
                photos={item.clientId ? photosForLine(photos, item.clientId) : []}
                onAdd={() => { void handleAddPhoto({ lineIndex: index, roomId: item.roomId }); }}
              />
            </View>
          );
        }}
        onScrollToIndexFailed={(info) => {
          const offset = info.averageItemLength * info.index;
          flatListRef.current?.scrollToOffset({ offset, animated: true });
        }}
        ListHeaderComponent={
          <>
            {needsReview ? (
              <ReviewBeforeSendingBanner
                onAcknowledge={() => {
                  if (!draft) return;
                  void acknowledgeDraftReview(draft.id).then(() => {
                    setNeedsReview(false);
                    setValidationError('');
                  });
                }}
              />
            ) : null}
            {quoteStatus === 'ai_failed' ? (
              <AiFailedBanner
                view={aiFailedRecoveryView({
                  audioExists,
                  lineCount: lineItems.length,
                })}
                retryDisabled={retryingVoice}
                onRetry={() => {
                  void handleRetryVoice();
                }}
                onRecordAgain={() => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  router.push(`/voice-record?quoteId=${id}` as any);
                }}
                onAddItems={() => setShowCatalogPicker(true)}
              />
            ) : null}
            <ClientSentenceField
              value={clientSentence}
              onChangeText={handleClientSentenceChange}
              onBlur={() => { void sentenceSync.flush(); }}
            />
            <PhotoStrip
              photos={photosForQuote(photos)}
              onAdd={() => { void handleAddPhoto({}); }}
            />
            <View style={styles.addRoomRow}>
              <TextInput
                style={styles.addRoomInput}
                value={newRoomName}
                onChangeText={setNewRoomName}
                placeholder={ADD_ROOM_PLACEHOLDER}
                placeholderTextColor={colors.mutedText}
                maxLength={80}
                returnKeyType="done"
                onSubmitEditing={() => { void handleAddRoom(); }}
                accessibilityLabel={ADD_ROOM_PLACEHOLDER}
              />
              <Pressable
                style={styles.addRoomButton}
                onPress={() => { void handleAddRoom(); }}
                accessibilityRole="button"
                accessibilityLabel={ADD_ROOM_LABEL}
              >
                <Text style={styles.addRoomButtonText}>{ADD_ROOM_LABEL}</Text>
              </Pressable>
            </View>
          </>
        }
        ListEmptyComponent={
          <EmptyState onAddItem={() => setShowCatalogPicker(true)} />
        }
        ListFooterComponent={
          <>
            <Pressable
              style={styles.addItemButton}
              onPress={() => {
                setAddToRoomId(null);
                setShowCatalogPicker(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Add item from catalog"
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
              <Text style={styles.addItemText}>Add Item</Text>
            </Pressable>
            <PrivateNoteField
              value={privateNote}
              onChangeText={handlePrivateNoteChange}
              onBlur={() => { void noteSync.flush(); }}
            />
          </>
        }
        contentContainerStyle={{ paddingBottom: 260 }}
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
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>{totalDisplay}</Text>
        </View>
        <Pressable
          style={[styles.shareButton, sharing && styles.shareButtonBusy]}
          onPress={() => { void handleSharePress(); }}
          accessibilityRole="button"
          accessibilityLabel={SHARE_QUOTE_LABEL}
          accessibilityState={{ disabled: sharing }}
        >
          <Text style={styles.shareButtonText}>{SHARE_QUOTE_LABEL}</Text>
        </Pressable>
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
        currentPriceCents={
          priceEditIndex !== null ? lineItems[priceEditIndex].unitPriceCents : null
        }
        onSave={(newPrice) => { void handlePriceSave(newPrice); }}
        onDismiss={() => setPriceEditIndex(null)}
      />

      <PrivateNoteSheet
        visible={lineNoteIndex !== null}
        lineName={lineNoteIndex !== null ? lineItems[lineNoteIndex]?.name ?? '' : ''}
        currentNote={lineNoteIndex !== null ? lineItems[lineNoteIndex]?.privateNote ?? null : null}
        onSave={(note) => { void handleLineNoteSave(note); }}
        onDismiss={() => setLineNoteIndex(null)}
      />

      <PrivateNoteSheet
        visible={roomNoteId !== null}
        lineName={rooms.find((room) => room.id === roomNoteId)?.name ?? ''}
        currentNote={rooms.find((room) => room.id === roomNoteId)?.privateNote ?? null}
        onSave={(note) => { void handleRoomNoteSave(note); }}
        onDismiss={() => setRoomNoteId(null)}
      />

      <AlternateOptionSheet
        visible={alternateForIndex !== null}
        baseName={alternateForIndex !== null ? lineItems[alternateForIndex]?.name ?? '' : ''}
        onSave={(value) => { void handleAddAlternate(value); }}
        onDismiss={() => setAlternateForIndex(null)}
      />

      <CatalogPickerSheet
        visible={showCatalogPicker}
        items={catalogItems.map((c) => ({ id: c.id, name: c.name, unitPriceCents: c.unitPriceCents }))}
        onSelect={(item) => { void handleAddItem(item); }}
        onDismiss={() => {
          setShowCatalogPicker(false);
          setAddToRoomId(null);
        }}
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
  addRoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  addRoomInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    fontSize: typography.body.fontSize,
    color: '#000000',
  },
  addRoomButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  addRoomButtonText: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: colors.accent,
  },
  roomHeader: {
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  roomHeaderTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
    color: '#000000',
  },
  roomHeaderActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  roomHeaderButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  roomHeaderButtonText: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: colors.accent,
  },
  roomAssign: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.dominant,
  },
  roomAssignButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  roomAssignText: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: colors.accent,
  },
  roomPicker: {
    gap: 0,
  },
  roomPickerChoice: {
    minHeight: 44,
    justifyContent: 'center',
  },
  roomPickerChoiceText: {
    fontSize: typography.label.fontSize,
    color: '#000000',
  },
  lineNoteButton: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  lineNoteText: {
    fontSize: typography.label.fontSize,
    fontWeight: typography.label.fontWeight,
    lineHeight: typography.label.lineHeight,
    color: '#000000',
  },
  lineNotePlaceholder: {
    color: colors.accent,
  },
  lineNoteHint: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.mutedText,
  },
  altBlock: {
    backgroundColor: colors.secondary,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.secondary,
  },
  optionBadge: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    lineHeight: typography.label.lineHeight,
    color: colors.accent,
  },
  optionBadgeAlt: {
    color: colors.mutedText,
  },
  optionSelectButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  optionSelectText: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: colors.accent,
  },
  optionAddButton: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    backgroundColor: colors.dominant,
  },
  optionAddText: {
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    color: colors.accent,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
    color: '#000000',
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    color: '#000000',
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
  shareButton: {
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.dominant,
  },
  shareButtonBusy: {
    opacity: 0.6,
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent,
  },
});
