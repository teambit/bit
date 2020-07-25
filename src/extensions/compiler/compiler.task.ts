import path from 'path';
import fs from 'fs-extra';
import { BuildTask, BuildContext, BuildResults } from '../builder';
import { Compiler } from './types';
import { Capsule } from '../isolator';

/**
 * compiler build task. Allows to compile components during component build.
 */
export class CompilerTask implements BuildTask {
  constructor(readonly extensionId: string) {}

  async execute(context: BuildContext): Promise<BuildResults> {
    const compilerInstance: Compiler = context.env.getCompiler();
    const buildResults = await compilerInstance.build(context);

    context.capsuleGraph.capsules.forEach((capsule) => this.copyNonSupportedFiles(capsule.capsule, compilerInstance));

    return buildResults;
  }

  copyNonSupportedFiles(capsule: Capsule, compiler: Compiler) {
    const component = capsule.component;
    component.filesystem.files.forEach((file) => {
      if (!compiler.isFileSupported(file.path)) {
        const content = file.contents;
        fs.outputFileSync(path.join(capsule.path, compiler.getDistDir(), file.relative), content);
      }
    });
  }
}
