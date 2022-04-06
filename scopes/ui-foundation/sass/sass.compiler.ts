import { renderSync } from 'sass';
import { BuiltTaskResult } from '@teambit/builder';
import { Compiler, TranspileFileOutput, TranspileFileParams } from '@teambit/compiler';

export class SassCompiler implements Compiler {
  constructor(readonly id: string) {}

  distDir = 'dist';
  displayName = 'Sass';

  shouldCopyNonSupportedFiles = true;

  displayConfig() {
    return JSON.stringify('');
  }

  version() {
    return '';
  }

  getDistDir() {
    return this.distDir;
  }

  transpileFile(fileContent: string, options: TranspileFileParams): TranspileFileOutput {
    const cssContent = renderSync({
      file: fileContent,
      sourceMap: true,
    });

    return [
      {
        outputText: cssContent.css.toString(),
        outputPath: options.filePath,
      },
      {
        outputText: cssContent?.map?.toString() || '',
        outputPath: `${options.filePath}.map`,
      },
    ];
  }

  async build(): Promise<BuiltTaskResult> {
    return {
      componentsResults: [],
    };
  }

  getDistPathBySrcPath(srcPath: string): string {
    return srcPath;
  }

  isFileSupported(filePath: string): boolean {
    return filePath.endsWith('.scss');
  }
}
