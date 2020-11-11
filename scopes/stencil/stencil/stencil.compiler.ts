import { TranspileOptions, transpileSync } from '@stencil/core/compiler';
import { BuildContext, BuiltTaskResult } from '@teambit/builder';
import { Compiler, TranspileOpts, TranspileOutput } from '@teambit/compiler';

// @ts-ignore
export class StencilCompiler implements Compiler {
  constructor(readonly id: string, private transpileOpts: TranspileOptions) {}
  distDir = 'dist';

  transpileFile(fileContent: string, options: TranspileOpts): TranspileOutput {
    const output = transpileSync(fileContent, this.transpileOpts);
    const path = options.filePath.split('.');
    path[path.length - 1] = 'js';

    return [
      {
        outputText: output.code,
        outputPath: path.join('.'),
      },
    ];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getDistPathBySrcPath(srcPath: string): string {
    throw new Error('Method not implemented.');
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isFileSupported(filePath: string): boolean {
    throw new Error('Method not implemented.');
  }
  // TODO: remove this once use context
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  build(context: BuildContext): Promise<BuiltTaskResult> {
    throw new Error('Method not implemented.');
  }
}
