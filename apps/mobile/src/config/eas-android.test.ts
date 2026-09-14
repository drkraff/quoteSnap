import fs from 'fs';
import path from 'path';

const easPath = path.join(__dirname, '../../eas.json');
const appConfigPath = path.join(__dirname, '../../app.config.ts');
const dbIndexPath = path.join(__dirname, '../db/index.ts');

describe('EAS Android preview config', () => {
  const eas = JSON.parse(fs.readFileSync(easPath, 'utf8')) as {
    build?: {
      preview?: {
        distribution?: string;
        environment?: string;
        developmentClient?: boolean;
        android?: { buildType?: string };
      };
    };
  };
  const appConfig = fs.readFileSync(appConfigPath, 'utf8');
  const dbIndex = fs.readFileSync(dbIndexPath, 'utf8');

  it('ships an internal APK profile without a Metro dev client', () => {
    const preview = eas.build?.preview;
    expect(preview?.distribution).toBe('internal');
    expect(preview?.environment).toBe('preview');
    expect(preview?.android?.buildType).toBe('apk');
    expect(preview?.developmentClient).toBeUndefined();
  });

  it('does not commit a real API URL or override newArchEnabled', () => {
    const raw = fs.readFileSync(easPath, 'utf8');
    expect(raw).not.toMatch(/up\.railway\.app/);
    expect(raw).not.toMatch(/newArchEnabled/);
    expect(raw).not.toMatch(/EXPO_PUBLIC_API_URL/);
  });

  it('keeps the RN old architecture and WatermelonDB JSI off', () => {
    expect(appConfig).toMatch(/newArchEnabled:\s*false/);
    expect(dbIndex).toMatch(/jsi:\s*false/);
  });

  it('uses a placeholder EAS project id until eas init', () => {
    expect(appConfig).toContain('00000000-0000-4000-8000-000000000000');
    expect(appConfig).toMatch(/EXPO_PUBLIC_API_URL/);
  });

  it('fails EAS cloud builds that would bake the emulator API fallback', () => {
    expect(appConfig).toMatch(/EAS_BUILD/);
    expect(appConfig).toMatch(/https:\/\//);
    expect(appConfig).toMatch(/docs\/EAS-ANDROID\.md/);
  });
});
