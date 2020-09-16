import { BuildContext, BuiltTaskResult, BuildTask } from '@teambit/builder';
import { Capsule } from '@teambit/isolator';
import fs from 'fs-extra';
import path from 'path';

import { Compiler } from './types';

/**
 * compiler build task. Allows to compile components during component build.
 */
export class CompilerTask implements BuildTask {
  readonly description = 'compile components';
  constructor(readonly id: string) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const compilerInstance: Compiler = context.env.getCompiler();
    const buildResults = await compilerInstance.build(context);

    await Promise.all(
      context.capsuleGraph.capsules.map((capsule) => this.copyNonSupportedFiles(capsule.capsule, compilerInstance))
    );

    return buildResults;
  }

  async copyNonSupportedFiles(capsule: Capsule, compiler: Compiler) {
    const component = capsule.component;
    await Promise.all(
      component.filesystem.files.map(async (file) => {
        if (compiler.isFileSupported(file.path)) return;
        const content = file.contents;
        await fs.outputFile(path.join(capsule.path, compiler.getDistDir(), file.relative), content);
      })
    );
    return { id: component.id, errors: [] };
  }
}
