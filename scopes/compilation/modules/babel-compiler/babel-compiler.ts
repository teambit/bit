import * as babel from '@babel/core';
import path from 'path';
import type { TransformOptions } from '@babel/core';

export type TranspileContext = {
  rootDir: string; // absolute path of the component's root directory
  filePath: string; // relative path of the file inside the component directory
};

export type TranspileOutput =
  | {
      outputText: string;
      outputPath: string;
    }[]
  | null;

/**
 * compile one file on the workspace
 */
export function transpileFileContent(
  fileContent: string,
  context: TranspileContext,
  options: TransformOptions,
  babelModule = babel
): TranspileOutput {
  if (!isFileSupported(context.filePath)) {
    return null; // file is not supported
  }
  let transformOptions = options || {};
  // the `sourceRoot` and `sourceFileName` are manually set because the dists are written into the
  // node_modules dir, so the debugger needs to know where to find the source.
  transformOptions.sourceRoot = context.rootDir;
  transformOptions.sourceFileName = context.filePath;
  transformOptions.filename = context.filePath;
  transformOptions = setConfigFileFalse(transformOptions);
  const result = babelModule.transformSync(fileContent, options);
  if (!result) {
    return null;
  }
  const code = result.code || '';
  const outputPath = replaceFileExtToJs(context.filePath);
  const mapFilePath = `${outputPath}.map`;
  const mapFileBasename = path.basename(mapFilePath);
  const outputText = result.map ? `${code}\n\n//# sourceMappingURL=${mapFileBasename}` : code;
  const outputFiles = [{ outputText, outputPath }];
  if (result.map) {
    outputFiles.push({
      outputText: JSON.stringify(result.map),
      outputPath: mapFilePath,
    });
  }
  return outputFiles;
}

export async function transpileFilePathAsync(
  filePath: string,
  options: TransformOptions,
  babelModule = babel
): Promise<TranspileOutput> {
  if (!isFileSupported(filePath)) {
    return null;
  }
  const transformOptions = setConfigFileFalse({ ...options });

  const result = await babelModule.transformFileAsync(filePath, transformOptions);
  if (!result || !result.code) {
    return null;
  }
  const outputPath = replaceFileExtToJs(filePath);
  const mapFilePath = `${outputPath}.map`;
  const code = result.code || '';
  const outputText = result.map ? `${code}\n\n//# sourceMappingURL=${mapFilePath}` : code;
  const outputFiles = [{ outputText, outputPath }];
  if (result.map) {
    outputFiles.push({
      outputText: JSON.stringify(result.map),
      outputPath: mapFilePath,
    });
  }
  return outputFiles;
}

/**
 * if it's not false, it searches for config files, which is probably not the expected behavior
 * here as the configuration is passed programmatically.
 * practically, when the configFile is not set, babel returns `null` for all files in the capsule
 */
function setConfigFileFalse(options: TransformOptions): TransformOptions {
  options.configFile = options.configFile ?? false;
  options.babelrc = options.babelrc ?? false;
  return options;
}

/**
 * whether babel is able to compile the given path
 */
export function isFileSupported(filePath: string): boolean {
  return (
    (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js') || filePath.endsWith('.jsx')) &&
    !filePath.endsWith('.d.ts')
  );
}

export function replaceFileExtToJs(filePath: string): string {
  if (!isFileSupported(filePath)) return filePath;
  const fileExtension = path.extname(filePath);
  return filePath.replace(new RegExp(`${fileExtension}$`), '.js'); // makes sure it's the last occurrence
}
