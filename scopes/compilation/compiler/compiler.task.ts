import { BuildContext, BuiltTaskResult, BuildTask, TaskResultsList } from '@teambit/builder';
import { EnvsMain } from '@teambit/envs';
import { Capsule } from '@teambit/isolator';
import fs from 'fs-extra';
import path from 'path';

import { CompilerAspect } from './compiler.aspect';
import { Compiler } from './types';

/**
 * compiler build task. Allows to compile components during component build.
 */
export class CompilerTask implements BuildTask {
  readonly description = 'compile components';
  constructor(
    readonly aspectId: string,
    readonly name: string,
    private compilerInstance: Compiler,
    private envs: EnvsMain
  ) {
    if (compilerInstance.artifactName) {
      this.description += ` for artifact ${compilerInstance.artifactName}`;
    }
  }

  async preBuild(context: BuildContext) {
    if (!this.compilerInstance.preBuild) return;
    await this.compilerInstance.preBuild(context);
  }

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const buildResults = await this.compilerInstance.build(context);

    await Promise.all(
      context.capsuleNetwork.graphCapsules.map((capsule) => {
        const component = capsule.component;
        const env = this.envs.getEnv(component);
        const compilerTask = env.env.getBuildPipe().find((task) => task.aspectId === CompilerAspect.id);
        return this.copyNonSupportedFiles(capsule, compilerTask.compilerInstance);
      })
    );

    return buildResults;
  }

  async postBuild?(context: BuildContext, tasksResults: TaskResultsList): Promise<void> {
    if (!this.compilerInstance.postBuild) return;
    await this.compilerInstance.postBuild(context, tasksResults);
  }

  async copyNonSupportedFiles(capsule: Capsule, compiler: Compiler) {
    if (!compiler.shouldCopyNonSupportedFiles) {
      return;
    }
    const component = capsule.component;
    await Promise.all(
      component.filesystem.files.map(async (file) => {
        if (compiler.isFileSupported(file.path)) return;
        const content = file.contents;
        await fs.outputFile(path.join(capsule.path, compiler.distDir, file.relative), content);
      })
    );
  }
}
