type MainModuleExports = {
  (...args: any[]): void;
  apiObject?: boolean;
};

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
  modulesMap: {
    default: {
      default: MainModuleExports;
    }
    [envId: string]: {
      default: MainModuleExports;
    }
  };

  isSplitComponentBundle?: boolean;
};

/** single preview module, e.g. compositions file */
export type ModuleFile<T = any> = Record<string, T>;
