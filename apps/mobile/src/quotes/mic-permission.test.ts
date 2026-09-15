import {
  MIC_PERMISSION_BODY,
  MIC_PERMISSION_CANCEL,
  MIC_PERMISSION_OPEN_SETTINGS,
  MIC_PERMISSION_TITLE,
} from './mic-permission';

describe('FAIL-02 mic permission copy', () => {
  it('names the permission and points at Settings (not a crash)', () => {
    expect(MIC_PERMISSION_TITLE).toBe('Microphone Access Required');
    expect(MIC_PERMISSION_BODY).toContain('Open Settings');
    expect(MIC_PERMISSION_CANCEL).toBe('Cancel');
    expect(MIC_PERMISSION_OPEN_SETTINGS).toBe('Open Settings');
  });
});
