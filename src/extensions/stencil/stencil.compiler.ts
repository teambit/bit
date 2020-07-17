import { transpileSync, TranspileOptions } from '@stencil/core/compiler';
import { Compiler } from '../compiler';
import { BuildContext, BuildResults } from '../builder';
import { CompilerOutput, CompilerOpts } from '../compiler/types';

export class StencilCompiler implements Compiler {
  constructor(private transpileOpts: TranspileOptions) {}

  compileFile(fileContent: string, options: CompilerOpts): CompilerOutput {
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

  // TODO: remove this once use context
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  compileOnCapsules(context: BuildContext): Promise<BuildResults> {
    throw new Error('Method not implemented.');
  }
}
