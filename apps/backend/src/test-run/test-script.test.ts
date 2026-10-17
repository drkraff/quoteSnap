import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { glob } from "node:fs/promises";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(backendRoot, "../..");

type PackageJson = {
  engines?: { node?: string };
  scripts?: Record<string, string>;
};

function filesOnDisk(rootDir: string, suffix: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith(suffix)) {
        found.push(path.relative(backendRoot, full));
      }
    }
  };
  walk(rootDir);
  return found.sort();
}

function quotedGlob(script: string, scriptName: string): string {
  const match = script.match(/['"]([^'"]+\*[^'"]+)['"]/);
  assert.ok(
    match,
    `Quote the glob in apps/backend/package.json scripts.${scriptName} so Node expands ** and runs tests in subfolders. Current script: ${script}`,
  );
  return match[1]!;
}

async function nodeGlob(pattern: string): Promise<string[]> {
  const found: string[] = [];
  for await (const file of glob(pattern, { cwd: backendRoot })) {
    found.push(file);
  }
  return found.sort();
}

describe("backend test globs", () => {
  it("quotes globs that include every nested test file and pins Node 22", async () => {
    const pkg = JSON.parse(readFileSync(path.join(backendRoot, "package.json"), "utf8")) as PackageJson;
    const rootPkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as PackageJson;
    const nvmrc = readFileSync(path.join(repoRoot, ".nvmrc"), "utf8").trim();

    assert.equal(nvmrc, "22");
    assert.equal(pkg.engines?.node, ">=22 <23");
    assert.equal(rootPkg.engines?.node, ">=22 <23");
    assert.equal(process.versions.node.split(".")[0], "22");

    const unitScript = pkg.scripts?.test ?? "";
    const integrationScript = pkg.scripts?.["test:integration"] ?? "";
    const unitPattern = quotedGlob(unitScript, "test");
    const integrationPattern = quotedGlob(integrationScript, "test:integration");

    assert.equal(unitPattern, "src/**/*.test.ts");
    assert.equal(integrationPattern, "src/integration/**/*.integration.ts");
    assert.deepEqual(await nodeGlob(unitPattern), filesOnDisk(path.join(backendRoot, "src"), ".test.ts"));
    assert.deepEqual(
      await nodeGlob(integrationPattern),
      filesOnDisk(path.join(backendRoot, "src/integration"), ".integration.ts"),
    );
    assert.ok(
      (await nodeGlob(unitPattern)).some((file) => file === "src/quotes/nested/canary.test.ts"),
    );
    assert.ok(
      (await nodeGlob(integrationPattern)).some(
        (file) => file === "src/integration/nested/canary.integration.ts",
      ),
    );
  });
});
