/**
 * Post-install guard: verifies critical build files that expo prebuild --clean drops.
 * Runs automatically via npm postinstall. Non-blocking on fresh install (before prebuild),
 * but warns loudly if android/ exists and the files are missing.
 */
const fs = require('fs');
const path = require('path');

const mobileRoot = path.resolve(__dirname, '..', 'apps', 'mobile');
const androidDir = path.join(mobileRoot, 'android');

// Only check if android/ exists (skip on fresh install before prebuild)
if (!fs.existsSync(androidDir)) {
  process.exit(0);
}

let issues = 0;

// Check 1: local.properties must exist with sdk.dir
const localProps = path.join(androidDir, 'local.properties');
if (!fs.existsSync(localProps)) {
  const sdkDir = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
  if (sdkDir) {
    const normalizedSdk = sdkDir.replace(/\\/g, '/');
    fs.writeFileSync(localProps, `sdk.dir=${normalizedSdk}\n`);
    console.log(`[post-prebuild-guard] Restored local.properties with sdk.dir=${normalizedSdk}`);
  } else {
    console.warn('[post-prebuild-guard] WARNING: android/local.properties missing and ANDROID_HOME not set');
    issues++;
  }
}

// Check 2: build.gradle kotlin-gradle-plugin must include explicit ${kotlinVersion}
const buildGradle = path.join(androidDir, 'build.gradle');
if (fs.existsSync(buildGradle)) {
  let content = fs.readFileSync(buildGradle, 'utf8');
  if (content.includes("classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')") &&
      !content.includes('kotlin-gradle-plugin:${kotlinVersion}')) {
    content = content.replace(
      "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')",
      'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:${kotlinVersion}")'
    );
    fs.writeFileSync(buildGradle, content);
    console.log('[post-prebuild-guard] Fixed build.gradle: pinned kotlin-gradle-plugin to ${kotlinVersion}');
  }
}

if (issues > 0) {
  console.warn(`[post-prebuild-guard] ${issues} issue(s) found — check output above`);
}
