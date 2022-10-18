/**
 * A full index of the preview data
 */
export type PreviewModule<T = any> = {
  /** Dictionary mapping components to their module files. */
  componentMap: Record<string, ModuleFile<T>[]>;

  /**
   * Dictionary mapping components to their preview metadata
   */
  componentMapMetadata: Record<string, unknown>;

  /** The 'main file' for this Preview type */
  mainModule: {
    default: {
      (...args: any[]): void;
      apiObject?: boolean;
    };
  };

  isSplitComponentBundle?: boolean;
};

/** single preview module, e.g. compositions file */
export type ModuleFile<T = any> = Record<string, T>;
