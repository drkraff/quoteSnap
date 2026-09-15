import { persistStillPlan, photoQueuePayload, shouldDropPhotoQueueItem } from './persist-photo';

const PHOTO_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('persistStillPlan / photoQueuePayload', () => {
  it('plans a documentDirectory copy and a pending upload queue item (no binary)', () => {
    const plan = persistStillPlan(
      { uri: 'file:///cache/pick.jpg', mimeType: 'image/jpeg' },
      'quote-1',
      'file:///docs/',
      PHOTO_A,
    );
    expect(plan.destUri).toBe(`file:///docs/photos/quote-1/${PHOTO_A}.jpg`);
    expect(plan.mime).toBe('image/jpeg');
    expect(photoQueuePayload({
      quoteLocalId: 'quote-1',
      photoId: PHOTO_A,
      filePath: plan.destUri,
      mime: plan.mime,
    })).toEqual({
      entityType: 'photo',
      entityId: 'quote-1',
      action: 'create',
      payload: {
        quoteLocalId: 'quote-1',
        photoId: PHOTO_A,
        filePath: plan.destUri,
        mime: 'image/jpeg',
      },
    });
  });
});

describe('shouldDropPhotoQueueItem', () => {
  it('drops a pending upload for the removed still and leaves other work alone', () => {
    expect(
      shouldDropPhotoQueueItem(
        {
          entityType: 'photo',
          status: 'pending',
          payload: { photoId: PHOTO_A },
        },
        PHOTO_A,
      ),
    ).toBe(true);
    expect(
      shouldDropPhotoQueueItem(
        {
          entityType: 'photo',
          status: 'dead_letter',
          payloadJson: JSON.stringify({ photoId: PHOTO_A, quoteLocalId: 'q1' }),
        },
        PHOTO_A,
      ),
    ).toBe(true);
    expect(
      shouldDropPhotoQueueItem(
        {
          entityType: 'photo',
          status: 'in_progress',
          payload: { photoId: PHOTO_A },
        },
        PHOTO_A,
      ),
    ).toBe(false);
    expect(
      shouldDropPhotoQueueItem(
        {
          entityType: 'photo',
          status: 'pending',
          payload: { photoId: PHOTO_A },
        },
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ),
    ).toBe(false);
    expect(
      shouldDropPhotoQueueItem(
        { entityType: 'quote', status: 'pending', payload: { photoId: PHOTO_A } },
        PHOTO_A,
      ),
    ).toBe(false);
  });
});
