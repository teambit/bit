import { ReleaseContext } from '../releases';
import { ReleaseTask, ReleaseResults } from '../releases';
import { Compiler } from './types';

/**
 * compiler release task. Allows to compile components during component releases.
 */
export class CompilerTask implements ReleaseTask {
  constructor(readonly extensionId: string) {}

  async execute(context: ReleaseContext): Promise<ReleaseResults> {
    const compilerInstance: Compiler = context.env.getCompiler();
    return compilerInstance.compileOnCapsules(context);
  }
}
