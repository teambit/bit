
export type ExtractorOptions = {
  /**
   * name of the string.
   */
  name?: string;

  /**
   * tsconfig string path.
   */
  tsconfig?: string;

  /**
   * TODO: support typescript module path.
   */
  // typescript?: string;

  /**
   * typescript compiler options. always overrides all.
   */
  compilerOptions?: string;
};
