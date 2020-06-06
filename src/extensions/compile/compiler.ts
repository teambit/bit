export interface Compiler {
  compileFile: (
    fileContent: string,
    options: { componentDir: string; filePath: string }
  ) => Array<{ outputText: string; outputPath: string }> | null;
  compileOnCapsules(capsuleDirs: string[]): { resultCode: number; error: Error | null };
  // @todo: it might not be needed if Flows doesn't help, needs to be discussed
  defineCompiler?: () => { taskFile: string; name: string }; // @todo: remove the "name", it's a hack
  // @todo: remove once we finalized the compilation on capsule
  watchMultiple?: (capsulePaths: string[]) => any;
}
