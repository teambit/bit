export type TypeScriptCompilerOptions = {
  /**
   * tsconfig to use during compilation.
   */
  tsconfig: Record<string, any>;

  /**
   * path for .d.ts files to include during build.
   */
  types: string[];
};
