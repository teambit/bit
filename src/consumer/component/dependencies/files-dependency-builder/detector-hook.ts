export type FileContext = {
  /**
   * extension of the file. (e.g. `.js`, '.jsx', '.ts', etc.)
   */
  ext: string;
};

export interface DependencyDetector {
  /**
   * determine whether to apply on given file.
   */
  isSupported(context: FileContext): boolean;

  /**
   * detect file dependencies. list of file dependencies of the module.
   */
  detect(fileContent: string): string[];
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
