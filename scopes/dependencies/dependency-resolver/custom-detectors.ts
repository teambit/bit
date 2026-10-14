import fs from 'fs';
import { isBuiltin } from 'module';
import path from 'path';
import { DetectorHook, type DependencyDetector } from './detector-hook';

export type CustomDetection = {
  /** what the detector returned, in its order (an object's keys, as `dependency-tree` reads them). */
  dependencies: string[];
  /** resolved through `lookupTypeScript` (a registered detector supports the file), not the extension's default lookup. */
  typescript: boolean;
  /**
   * what a detector's `dependencyLookup` returned per specifier: an absolute path (`path.resolve`d, as
   * `fs.existsSync` reads it), or `null` when it returned nothing. Absent when no lookup applies.
   * Built-ins and http specifiers are not looked up, as `dependency-tree` skips them.
   */
  lookups?: Record<string, string | null>;
};

/**
 * The detection precinct's `getDetector` performs before the built-in detectives, for the native
 * installer (docs/rust/native-install.md, `detectDependencies`): per file, the first env detector
 * (`getDepDetectors()`) supporting it, else the first detector aspects registered
 * (`registerDetector`) when one of them is not natively replicated (`isNativelyReplicated`).
 * Files no custom detector claims are left out: the native scanner detects them.
 * `directory` is the component dir `filing-cabinet` passes a `dependencyLookup`.
 * `null` when there is no custom detector at all.
 */
export async function detectWithCustomDetectors(
  envDetectors: DependencyDetector[] | null | undefined,
  files: string[],
  directory: string
): Promise<Record<string, CustomDetection> | null> {
  const fromEnv = envDetectors ?? [];
  const registered = DetectorHook.hooks.some((hook) => !isNativelyReplicated(hook));
  if (!fromEnv.length && !registered) return null;
  const hook = new DetectorHook();
  const result: Record<string, CustomDetection> = {};
  for (const filename of files) {
    const ext = path.extname(filename);
    const context = { ext, filename };
    // env.jsonc keeps its native handling, as the canonical env.jsonc detector does.
    const fromHook = registered && !filename.endsWith('env.jsonc') ? hook.getDetector(ext, filename) : undefined;
    const detector = fromEnv.find((candidate) => candidate.isSupported(context)) ?? fromHook;
    if (!detector) continue;
    let content: string;
    try {
      content = fs.readFileSync(filename, 'utf8');
    } catch {
      continue;
    }
    const lookup = dependencyLookup(fromEnv, fromHook, context);
    const detection: CustomDetection = { dependencies: [], typescript: Boolean(fromHook) };
    try {
      const raw = await detect(detector, content);
      detection.dependencies = Array.isArray(raw) ? raw : Object.keys(raw);
      if (lookup) detection.lookups = lookUp(lookup, raw, { filename, directory, envDetectors: fromEnv });
    } catch {
      // `dependency-tree` records a parse or resolve error for the file: it yields nothing.
      detection.dependencies = [];
    }
    result[filename] = detection;
  }
  return result;
}

/** The detectors Bit's own aspects register, which the native scanner replicates. */
const NATIVE_DETECTORS = new Set(['EnvJsoncDetector', 'MDXDependencyDetector']);

/**
 * A registered detector the native scanner replicates: an instance of the env.jsonc or the MDX
 * detector class itself (not a subclass), whose support predicate is not overridden on the instance.
 */
function isNativelyReplicated(hook: DependencyDetector): boolean {
  const prototype = Object.getPrototypeOf(hook);
  return (
    NATIVE_DETECTORS.has(prototype?.constructor?.name) &&
    Object.getPrototypeOf(prototype) === Object.prototype &&
    !Object.hasOwn(hook, 'isSupported')
  );
}

/**
 * `filing-cabinet`'s resolver choice: the lookup of the registered detector supporting the file,
 * overridden by the last env detector supporting it that has one. Called unbound, as there.
 */
function dependencyLookup(
  fromEnv: DependencyDetector[],
  fromHook: DependencyDetector | undefined,
  context: { ext: string; filename: string }
): DependencyDetector['dependencyLookup'] {
  let lookup = fromHook?.dependencyLookup;
  for (const detector of fromEnv) {
    if (detector.isSupported(context) && detector.dependencyLookup) lookup = detector.dependencyLookup;
  }
  return lookup;
}

/** The `cabinet()` options `dependency-tree` builds, without the parser state a custom detector never sets. */
function lookUp(
  lookup: NonNullable<DependencyDetector['dependencyLookup']>,
  raw: string[] | Record<string, any>,
  options: { filename: string; directory: string; envDetectors: DependencyDetector[] }
): Record<string, string | null> {
  const lookups: Record<string, string | null> = {};
  const dependencies = Array.isArray(raw) ? raw : Object.keys(raw);
  for (const dependency of dependencies) {
    if (dependency in lookups || isBuiltin(dependency) || /^https?:\/\//.test(dependency)) continue;
    const params: Record<string, any> = { ...options, dependency, config: null, webpackConfig: null };
    // used for vue
    if (!Array.isArray(raw) && raw[dependency]?.isScript !== undefined) params.isScript = raw[dependency].isScript;
    const resolved: unknown = lookup(params as any);
    lookups[dependency] = typeof resolved === 'string' && resolved ? path.resolve(resolved) : null;
  }
  return lookups;
}

/** `getDepsFromFile` on a custom detector: `@bit-no-check` files yield nothing, other values are dropped. */
async function detect(detector: DependencyDetector, content: string): Promise<string[] | Record<string, any>> {
  if (content.startsWith('// @bit-no-check') || content.startsWith('/* @bit-no-check')) return [];
  const deps: unknown = await detector.detect(content);
  if (Array.isArray(deps)) return deps.filter((dep): dep is string => typeof dep === 'string');
  return deps && typeof deps === 'object' ? (deps as Record<string, any>) : [];
}
