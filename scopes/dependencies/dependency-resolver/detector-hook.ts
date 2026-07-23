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

  /**
   * a fallback detector is used only when no regular detector supports the file. it lets core
   * aspects provide a baseline detection (e.g. regex-based imports extraction for md/mdx) while a
   * loaded aspect with a full parser for the same extension takes precedence.
   */
  isFallback?: boolean;
}

export class DetectorHook {
  static hooks: DependencyDetector[] = [];

  isSupported(ext: string, filename: string): boolean {
    return !!this.getDetector(ext, filename);
  }

  getDetector(ext: string, filename: string): DependencyDetector | undefined {
    const supported = DetectorHook.hooks.filter((hook) => {
      return hook.isSupported({
        ext,
        filename,
      });
    });
    return supported.find((hook) => !hook.isFallback) ?? supported[0];
  }
}
