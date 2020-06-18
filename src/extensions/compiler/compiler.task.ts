import { BuildContext } from '../builder';
import { BuildTask, BuildResults } from '../builder';
import { Compiler } from './types';

/**
 * compiler build task. Allows to compile components during component build.
 */
export class CompilerTask implements BuildTask {
  constructor(readonly extensionId: string) {}

  async execute(context: BuildContext): Promise<BuildResults> {
    const compilerInstance: Compiler = context.env.getCompiler();
    return compilerInstance.compileOnCapsules(context);
  }
}
