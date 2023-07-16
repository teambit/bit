export type FileContext = {
  /**
   * extension of the file. (e.g. `.js`, '.jsx', '.ts', etc.)
   */
  ext: string;
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

export class DetectorHook {
  static hooks: DependencyDetector[] = [];

  isSupported(ext: string): boolean {
    return !!DetectorHook.hooks.find((hook) => {
      return hook.isSupported({
        ext,
      });
    });
  }

  getDetector(ext: string): DependencyDetector | undefined {
    return DetectorHook.hooks.find((hook) => {
      return hook.isSupported({
        ext,
      });
    });
  }
}
