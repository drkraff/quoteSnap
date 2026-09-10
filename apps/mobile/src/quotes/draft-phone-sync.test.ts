import {
  PHONE_SYNC_DEBOUNCE_MS,
  createDraftPhoneSync,
  createLatestDebouncer,
  type DraftPhoneSyncPayload,
} from './draft-phone-sync';

function phone(
  customerPhone: string,
  quoteId = 'q1',
): DraftPhoneSyncPayload {
  return { quoteId, customerPhone };
}

describe('createLatestDebouncer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not invoke until the delay elapses', async () => {
    const callback = jest.fn();
    const debouncer = createLatestDebouncer(callback, PHONE_SYNC_DEBOUNCE_MS);

    debouncer.schedule('a');
    debouncer.schedule('ab');
    debouncer.schedule('abc');
    expect(callback).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(PHONE_SYNC_DEBOUNCE_MS - 1);
    expect(callback).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('abc');
  });

  it('flush invokes the pending value immediately', async () => {
    const callback = jest.fn();
    const debouncer = createLatestDebouncer(callback, PHONE_SYNC_DEBOUNCE_MS);

    debouncer.schedule('555');
    await debouncer.flush();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('555');
  });

  it('flush is a no-op when nothing is pending', async () => {
    const callback = jest.fn();
    const debouncer = createLatestDebouncer(callback, PHONE_SYNC_DEBOUNCE_MS);

    await debouncer.flush();
    expect(callback).not.toHaveBeenCalled();
  });

  it('cancel drops a pending value so the timer does not fire', async () => {
    const callback = jest.fn();
    const debouncer = createLatestDebouncer(callback, PHONE_SYNC_DEBOUNCE_MS);

    debouncer.schedule('lost');
    debouncer.cancel();
    await jest.advanceTimersByTimeAsync(PHONE_SYNC_DEBOUNCE_MS);

    expect(callback).not.toHaveBeenCalled();
  });

  it('keeps the latest value if schedule happens while a callback is in flight', async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const seen: string[] = [];
    const callback = jest.fn(async (value: string) => {
      seen.push(value);
      if (value === 'first') {
        await first;
      }
    });
    const debouncer = createLatestDebouncer(callback, PHONE_SYNC_DEBOUNCE_MS);

    debouncer.schedule('first');
    await jest.advanceTimersByTimeAsync(PHONE_SYNC_DEBOUNCE_MS);
    expect(callback).toHaveBeenCalledTimes(1);

    debouncer.schedule('second');
    release();
    await debouncer.flush();

    expect(seen).toEqual(['first', 'second']);
  });
});

describe('createDraftPhoneSync', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('enqueues once for rapid keystrokes, using the latest number', async () => {
    const enqueuePhone = jest.fn(async () => undefined);
    const sync = createDraftPhoneSync(enqueuePhone, PHONE_SYNC_DEBOUNCE_MS);

    sync.schedule(phone('5'));
    sync.schedule(phone('55'));
    sync.schedule(phone('555'));
    sync.schedule(phone('5551'));
    expect(enqueuePhone).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(PHONE_SYNC_DEBOUNCE_MS);
    expect(enqueuePhone).toHaveBeenCalledTimes(1);
    expect(enqueuePhone).toHaveBeenCalledWith(phone('5551'));
  });

  it('does not enqueue the loaded phone until the contractor edits it', async () => {
    const enqueuePhone = jest.fn(async () => undefined);
    const sync = createDraftPhoneSync(enqueuePhone, PHONE_SYNC_DEBOUNCE_MS);

    sync.markSynced(phone('5551234567'));
    sync.schedule(phone('5551234567'));
    await jest.advanceTimersByTimeAsync(PHONE_SYNC_DEBOUNCE_MS);
    expect(enqueuePhone).not.toHaveBeenCalled();

    sync.schedule(phone('5551234568'));
    await jest.advanceTimersByTimeAsync(PHONE_SYNC_DEBOUNCE_MS);
    expect(enqueuePhone).toHaveBeenCalledTimes(1);
    expect(enqueuePhone).toHaveBeenCalledWith(phone('5551234568'));
  });

  it('flush on blur/unmount sends the pending number', async () => {
    const enqueuePhone = jest.fn(async () => undefined);
    const sync = createDraftPhoneSync(enqueuePhone, PHONE_SYNC_DEBOUNCE_MS);

    sync.schedule(phone('5551234567'));
    await sync.flush();

    expect(enqueuePhone).toHaveBeenCalledTimes(1);
    expect(enqueuePhone).toHaveBeenCalledWith(phone('5551234567'));
  });

  it('retries the same number later if enqueue fails', async () => {
    const enqueuePhone = jest
      .fn()
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce(undefined);
    const sync = createDraftPhoneSync(enqueuePhone, PHONE_SYNC_DEBOUNCE_MS);

    sync.schedule(phone('555'));
    await jest.advanceTimersByTimeAsync(PHONE_SYNC_DEBOUNCE_MS);
    expect(enqueuePhone).toHaveBeenCalledTimes(1);

    sync.schedule(phone('555'));
    await jest.advanceTimersByTimeAsync(PHONE_SYNC_DEBOUNCE_MS);
    expect(enqueuePhone).toHaveBeenCalledTimes(2);
  });

  it('enqueues against the quote id captured at schedule time', async () => {
    const enqueuePhone = jest.fn(async () => undefined);
    const sync = createDraftPhoneSync(enqueuePhone, PHONE_SYNC_DEBOUNCE_MS);

    sync.schedule(phone('555', 'old-quote'));
    sync.schedule(phone('5551', 'old-quote'));
    await sync.flush();

    expect(enqueuePhone).toHaveBeenCalledWith(phone('5551', 'old-quote'));
  });
});
