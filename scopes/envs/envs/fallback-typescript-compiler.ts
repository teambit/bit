/**
 * a minimal typescript compiler used by the fallback default env (see getFallbackDefaultEnv).
 * it is needed when a component/aspect must be compiled while its env is not loaded (e.g.
 * compiling an aspect/env inside a capsule before "bit install" installed its env).
 * it transpiles typescript files without type-checking, which is enough for generating
 * requirable dists.
 */
let cachedCompiler: ReturnType<typeof buildFallbackTypescriptCompiler> | undefined;

export function getFallbackTypescriptCompiler() {
  // the compiler is stateless and its config is static - build it once. it may be requested per
  // component (e.g. when computing component issues) on every command.
  cachedCompiler ??= buildFallbackTypescriptCompiler();
  return cachedCompiler;
}

function buildFallbackTypescriptCompiler() {
  let ts;
  try {
    ts = require('typescript');
  } catch {
    throw new Error(
      'the fallback compiler requires the "typescript" package, which is not installed. run "bit install" to install the component env'
    );
  }
  const supportedExtensions = ['.ts', '.tsx', '.jsx', '.mts', '.cts'];
  const compilerOptions = {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
    sourceMap: false,
  };
  const replaceFileExtToJs = (filePath: string): string => filePath.replace(/\.(ts|tsx|jsx|mts|cts)$/, '.js');
  return {
    id: 'teambit.envs/envs/fallback-typescript-compiler',
    displayName: 'Fallback TypeScript',
    distDir: 'dist',
    shouldCopyNonSupportedFiles: true,
    displayConfig: () => JSON.stringify(compilerOptions, null, 2),
    version: () => ts.version as string,
    isFileSupported: (filePath: string) =>
      supportedExtensions.some((ext) => filePath.endsWith(ext)) &&
      !['.d.ts', '.d.mts', '.d.cts'].some((ext) => filePath.endsWith(ext)),
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
    // the fallback env has no build pipeline, so this should never run. it's here to satisfy the
    // Compiler contract with an actionable error instead of "build is not a function".
    build: () => {
      throw new Error(
        'the fallback compiler cannot run inside a build pipeline. the component env was not loaded, run "bit install" to install it'
      );
    },
  };
}
