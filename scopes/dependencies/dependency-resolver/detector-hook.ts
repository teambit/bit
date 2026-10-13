import path from 'path';

export type FileContext = {
  /**
   * extension of the file. (e.g. `.js`, '.jsx', '.ts', etc.)
   */
  ext: string;

  filename: string;
};

export type DependencyContext = {
  /**
   * name of the dependency.
   * e.g. `lodash` in `import _ from 'lodash'`
   */
  dependency: string;

  /**
   * name of the file.
   */
  filename: string;

  /**
   * directory of the file.
   */
  directory: string;
};

export interface DependencyDetector {
  /**
   * determine whether to apply on given file.
   */
  isSupported(context: FileContext): boolean;

  /**
   * determine what type of content the detector is for.
   * by default, the type is the extension name of the file (without the dot)
   * if no type provided.
   */
  type?: string;

  /**
   * detect file dependencies. list of file dependencies of the module.
   */
  detect(fileContent: string): string[];

  /**
   * resolve the imported file location
   * @param file
   */
  dependencyLookup?(file: DependencyContext): string;
}

const nativeEnvJsoncDetectors = new WeakMap<
  DependencyDetector,
  { prototype: object; predicate: unknown; mdx?: boolean }
>();

export class DetectorHook {
  /** Receipt for the canonical, pure env.jsonc predicate; arbitrary hooks still require dispatch. */
  static registerNativeEnvJsoncDetector(detector: DependencyDetector, prototype: object, predicate: unknown) {
    nativeEnvJsoncDetectors.set(detector, { prototype, predicate });
  }

  static registerNativeMdxDetector(detector: DependencyDetector, prototype: object, predicate: unknown) {
    nativeEnvJsoncDetectors.set(detector, { prototype, predicate, mdx: true });
  }

  static replayNativeGraphHooks(filename: string | undefined) {
    if (!filename) return;
    for (const hook of DetectorHook.hooks) {
      if (nativeEnvJsoncDetectors.get(hook)?.mdx) (hook as any).currentFilename = filename;
    }
  }

  static canSkipNativeGraphHooks(filename: string): boolean {
    return DetectorHook.hooks.every((hook) => {
      const receipt = nativeEnvJsoncDetectors.get(hook);
      return Boolean(
        receipt &&
          Object.getPrototypeOf(hook) === receipt.prototype &&
          !Object.hasOwn(hook, 'isSupported') &&
          Object.getOwnPropertyDescriptor(receipt.prototype, 'isSupported')?.value === receipt.predicate &&
          (receipt.mdx ? canSkipMdx(hook, filename) : !filename.endsWith('env.jsonc'))
      );
    });
  }
  static hooks: DependencyDetector[] = [];

  isSupported(ext: string, filename: string): boolean {
    return !!DetectorHook.hooks.find((hook) => {
      return hook.isSupported({
        ext,
        filename,
      });
    });
  }

  getDetector(ext: string, filename: string): DependencyDetector | undefined {
    return DetectorHook.hooks.find((hook) => {
      return hook.isSupported({
        ext,
        filename,
      });
    });
  }
}

function canSkipMdx(hook: DependencyDetector, filename: string): boolean {
  const extensions = Object.getOwnPropertyDescriptor(hook, 'supportedExtensions')?.value;
  const current = Object.getOwnPropertyDescriptor(hook, 'currentFilename');
  if (current ? !('value' in current) || !current.writable : !Object.isExtensible(hook)) return false;
  if (current && current.value !== undefined && typeof current.value !== 'string') return false;
  if (!Array.isArray(extensions) || Object.getPrototypeOf(extensions) !== Array.prototype) return false;
  if (extensions.length > 256 || Reflect.ownKeys(extensions).length !== extensions.length + 1) return false;
  for (let index = 0; index < extensions.length; index++) {
    const extension = Object.getOwnPropertyDescriptor(extensions, String(index))?.value;
    if (typeof extension !== 'string' || extension === path.extname(filename)) return false;
  }
  return true;
}
