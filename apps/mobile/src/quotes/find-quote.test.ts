import { QUOTE_NOT_FOUND, findQuoteRecord } from './find-quote';

describe('findQuoteRecord', () => {
  it('returns the record when find resolves', async () => {
    const record = { id: 'q1' };
    await expect(findQuoteRecord(async () => record)).resolves.toEqual({
      ok: true,
      record,
    });
  });

  it('returns Quote not found when Watermelon find() rejects', async () => {
    await expect(
      findQuoteRecord(async () => {
        throw new Error('Record not found');
      }),
    ).resolves.toEqual({ ok: false, error: QUOTE_NOT_FOUND });
  });
});
