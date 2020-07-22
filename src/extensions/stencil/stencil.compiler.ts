import { transpileSync, TranspileOptions } from '@stencil/core/compiler';
import { Compiler } from '../compiler';
import { BuildContext, BuildResults } from '../builder';
import { TranspileOutput, TranspileOpts } from '../compiler/types';

export class StencilCompiler implements Compiler {
  constructor(private transpileOpts: TranspileOptions) {}

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

  getDistDir(): string {
    throw new Error('Method not implemented.');
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
  build(context: BuildContext): Promise<BuildResults> {
    throw new Error('Method not implemented.');
  }
}
