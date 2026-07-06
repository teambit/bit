/**
 * a minimal typescript compiler used by the fallback default env (see getFallbackDefaultEnv).
 * it is needed when a component/aspect must be compiled while its env is not loaded (e.g.
 * compiling an aspect/env inside a capsule before "bit install" installed its env).
 * it transpiles typescript files without type-checking, which is enough for generating
 * requirable dists.
 */
export function getFallbackTypescriptCompiler() {
  let ts;
  try {
    // eslint-disable-next-line global-require
    ts = require('typescript');
  } catch {
    throw new Error(
      'the fallback compiler requires the "typescript" package, which is not installed. run "bit install" to install the component env'
    );
  }
  const supportedExtensions = ['.ts', '.tsx', '.jsx'];
  const compilerOptions = {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
    sourceMap: false,
  };
  const replaceFileExtToJs = (filePath: string): string => filePath.replace(/\.(ts|tsx|jsx)$/, '.js');
  return {
    id: 'teambit.envs/envs/fallback-typescript-compiler',
    displayName: 'Fallback TypeScript',
    distDir: 'dist',
    shouldCopyNonSupportedFiles: true,
    displayConfig: () => JSON.stringify(compilerOptions, null, 2),
    version: () => ts.version as string,
    isFileSupported: (filePath: string) =>
      supportedExtensions.some((ext) => filePath.endsWith(ext)) && !filePath.endsWith('.d.ts'),
    getDistPathBySrcPath: (srcPath: string) => `dist/${replaceFileExtToJs(srcPath)}`,
    transpileFile: (fileContent: string, options: { componentDir: string; filePath: string }) => {
      const result = ts.transpileModule(fileContent, {
        compilerOptions,
        fileName: options.filePath,
      });
      return [
        {
          outputText: result.outputText,
          outputPath: replaceFileExtToJs(options.filePath),
        },
      ];
    },
  };
}
