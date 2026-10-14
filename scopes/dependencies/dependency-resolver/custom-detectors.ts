import fs from 'fs';
import path from 'path';
import { DetectorHook, type DependencyDetector } from './detector-hook';

export type CustomDetection = {
  /** what the detector returned, in its order (an object's keys, as `dependency-tree` reads them). */
  dependencies: string[];
  /** resolved through `lookupTypeScript` (a registered detector), not the extension's default lookup. */
  typescript: boolean;
};

/**
 * The detection precinct's `getDetector` performs before the built-in detectives, for the native
 * installer (docs/rust/native-install.md, `detectDependencies`): per file, the first env detector
 * (`getDepDetectors()`) supporting it, else the first detector aspects registered
 * (`registerDetector`) when one of them is not natively replicated (`canSkipNativeGraphHooks`).
 * Files no custom detector claims are left out: the native scanner detects them.
 * `null` when there is no custom detector at all.
 */
export async function detectWithCustomDetectors(
  envDetectors: DependencyDetector[] | null | undefined,
  files: string[]
): Promise<Record<string, CustomDetection> | null> {
  const fromEnv = envDetectors ?? [];
  const registered = !DetectorHook.canSkipNativeGraphHooks('');
  if (!fromEnv.length && !registered) return null;
  const hook = new DetectorHook();
  const result: Record<string, CustomDetection> = {};
  for (const filename of files) {
    const ext = path.extname(filename);
    let typescript = false;
    let detector = fromEnv.find((candidate) => candidate.isSupported({ ext, filename }));
    // env.jsonc keeps its native handling, as the canonical env.jsonc detector does.
    if (!detector && registered && !filename.endsWith('env.jsonc')) {
      detector = hook.getDetector(ext, filename);
      typescript = true;
    }
    if (!detector) continue;
    let content: string;
    try {
      content = fs.readFileSync(filename, 'utf8');
    } catch {
      continue;
    }
    result[filename] = { dependencies: await detect(detector, content), typescript };
  }
  return result;
}

/** `getDepsFromFile` on a custom detector: `@bit-no-check` files and parse errors yield nothing. */
async function detect(detector: DependencyDetector, content: string): Promise<string[]> {
  if (content.startsWith('// @bit-no-check') || content.startsWith('/* @bit-no-check')) return [];
  try {
    const deps: unknown = await detector.detect(content);
    if (Array.isArray(deps)) return deps.filter((dep): dep is string => typeof dep === 'string');
    return deps && typeof deps === 'object' ? Object.keys(deps) : [];
  } catch {
    return [];
  }
}
