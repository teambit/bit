import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs-extra';
import type { UIRoot } from '@teambit/ui';
import type { AspectDefinition } from '@teambit/aspect-loader';
import { getAspectArtifactDir } from '@teambit/aspect-loader';
import type { SlotRegistry } from '@teambit/harmony';
import type { ArtifactDefinition } from '@teambit/builder';
import { sha1 } from '@teambit/toolbox.crypto.sha1';

/// utils

export type UIRootRegistry = SlotRegistry<UIRoot>;

// bundle hash

export const BUNDLE_HASH_FILENAME = '.hash';

export function readBundleHash(bundleId: string, bundleDir: string, aspectDir: string): string {
  const bundlePath = getBundlePath(bundleId, bundleDir, aspectDir);
  if (!bundlePath) {
    return '';
  }
  const hashFilePath = join(bundlePath, BUNDLE_HASH_FILENAME);
  if (existsSync(hashFilePath)) {
    return readFileSync(hashFilePath).toString();
  }
  return '';
}

/**
 * the identity of a pre-bundle: the sorted ids of the aspects it was built from. the hash over this
 * list is what decides whether a shipped pre-bundle can be served or has to be rebuilt, so having
 * the list itself is the only way to see *why* a rebuild was triggered.
 */
export function getAspectIds(aspects: AspectDefinition[]): string[] {
  return aspects
    .slice()
    .sort((a, b) => ((a.getId || a.aspectPath) > (b.getId || b.aspectPath) ? 1 : -1))
    .map((aspect) => aspect.getId || aspect.aspectPath);
}

export function hashAspects(aspects: AspectDefinition[]): string {
  return sha1(getAspectIds(aspects).join(''));
}

export async function getBundleAspectIds(uiRoot: UIRoot, runtime: string): Promise<string[]> {
  return getAspectIds(await uiRoot.resolveAspects(runtime));
}

export async function createBundleHash(uiRoot: UIRoot, runtime: string): Promise<string> {
  return hashAspects(await uiRoot.resolveAspects(runtime));
}

/**
 * hashes the aspects the caller actually bundled, rather than re-resolving them - the artifact and
 * its `.hash` must describe the same list or the pre-bundle can never be matched.
 */
export function generateBundleHash(aspects: AspectDefinition[], outputPath: string): void {
  if (!existsSync(outputPath)) mkdirSync(outputPath);
  writeFileSync(join(outputPath, BUNDLE_HASH_FILENAME), hashAspects(aspects));
}

// bundle artifact

export function getBundleArtifactDirectory(bundleDir: string, aspectDir: string) {
  return join('artifacts', bundleDir, aspectDir);
}

export function getBundleArtifactDef(bundleDir: string, aspectDir: string): ArtifactDefinition {
  const rootDir = getBundleArtifactDirectory(bundleDir, aspectDir);
  return {
    name: `${bundleDir}${aspectDir ? '-' : ''}${aspectDir}`,
    globPatterns: [`${rootDir}/**`],
  };
}

export function getBundlePath(bundleId: string, bundleDir: string, aspectDir: string): string | undefined {
  return getAspectArtifactDir(bundleId, getBundleArtifactDirectory(bundleDir, aspectDir));
}

// others

export function clearConsole() {
  process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
}
