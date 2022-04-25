import { BuildContext, BuiltTaskResult, BuildTask } from '@teambit/builder';
import path from 'path';
import { CompilerAspect } from '@teambit/compiler';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { hardLinkDirectory } from '@teambit/toolbox.fs.hard-link-directory';

export class CapsulesSyncerTask implements BuildTask {
  readonly name = 'SyncComponents';
  readonly dependencies = [CompilerAspect.id]; // I can put my new task here. And compiler to the deps of this taks
  constructor(readonly aspectId: string, private dependencyResolver: DependencyResolverMain) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    if (!this.dependencyResolver.hasRootComponents())
      return {
        artifacts: [],
        componentsResults: [],
      };
    await Promise.all(
      context.capsuleNetwork.seedersCapsules.map(async (capsule) => {
        const relCompDir = path.relative(context.capsuleNetwork.capsulesRootDir, capsule.path).replace(/\\/g, '/');
        const injectedDirs = await this.dependencyResolver.getInjectedDirs(
          context.capsuleNetwork.capsulesRootDir,
          relCompDir,
          this.dependencyResolver.getPackageName(capsule.component)
        );
        return hardLinkDirectory(
          capsule.path,
          injectedDirs.map((injectedDir) => path.join(context.capsuleNetwork.capsulesRootDir, injectedDir))
        );
      })
    );
    return {
      artifacts: [],
      componentsResults: [],
    };
  }
}
