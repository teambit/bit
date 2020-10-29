/**
 * A full index of the preview data
 */
export type PreviewModule<T = any> = {
  /** Dictionary mapping components to their module files. */
  componentMap: Record<string, ModuleFile<T>[]>;

  /** The 'main file' for this Preview type */
  mainModule: {
    default: (...args: any[]) => void;
  };
};

/** single preview module, e.g. compositions file */
export type ModuleFile<T = any> = Record<string, T>;
