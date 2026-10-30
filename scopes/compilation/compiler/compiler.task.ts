import type { BuildContext, BuiltTaskResult, BuildTask, TaskResultsList } from '@teambit/builder';
import type { Capsule } from '@teambit/isolator';
import type { EnvContext, EnvHandler } from '@teambit/envs';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import fs from 'fs-extra';
import path from 'path';
import type { Compiler } from './types';
import { CompilerAspect } from './compiler.aspect';

export type CompilerTaskOptions = {
  /**
   * instance of compiler to use.
   */
  compiler: EnvHandler<Compiler>;

  /**
   * name of compiler task
   */
  name?: string;
};

/**
 * compiler build task. Allows to compile components during component build.
 */
export class CompilerTask implements BuildTask {
  readonly description = 'compile components';
  constructor(
    readonly aspectId: string,
    readonly name: string,
    readonly compilerInstance: Compiler,
    private dependencyResolver: DependencyResolverMain
  ) {
    if (compilerInstance.artifactName) {
      this.description += ` for artifact ${compilerInstance.artifactName}`;
    }
  }

  async preBuild(context: BuildContext) {
    await Promise.all(
      context.capsuleNetwork.seedersCapsules.map((capsule) =>
        this.copyNonSupportedFiles(capsule, this.compilerInstance)
      )
    );
    if (!this.compilerInstance.preBuild) return;
    await this.compilerInstance.preBuild(context);
  }

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const buildResults = await this.compilerInstance.build(context);
    await this._hardLinkBuildArtifactsOnCapsules(context);
    return buildResults;
  }

  /**
   * This function hard links the compiled artifacts to the `node_modules` of other component capsules.
   * For instance, if we have a `button` component that is a dependency of the `card` component,
   * then the `dist` folder of the `button` component will be copied to `<card_capsule>/node_modules/button/dist`.
   */
  private async _hardLinkBuildArtifactsOnCapsules(context: BuildContext): Promise<void> {
    // lazy on purpose: this is the only build-time-only dependency of this module, and the module
    // itself loads on every bit invocation (via envs). a top-level import pulls the package plus
    // its own fs-extra tree (~36 files in the released bundle's hoisted layout) into every
    // bootstrap/status, which is what pushed the filesystem-read e2e guard over its threshold.
    const { hardLinkDirectory } = await import('@teambit/toolbox.fs.hard-link-directory');
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
          // An injected copy is reported relative to the lockfile dir when it sits under it, and
          // absolute when it cannot - which is what the global virtual store always produces, since
          // its slots live outside the capsule root entirely. Joining an absolute path onto the
          // capsule root would silently produce `<capsulesRoot>/<store path>` and link the
          // artifacts into nowhere.
          injectedDirs.map((injectedDir) =>
            path.isAbsolute(injectedDir) ? injectedDir : path.join(context.capsuleNetwork.capsulesRootDir, injectedDir)
          )
        );
      })
    );
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

  static from(options: CompilerTaskOptions) {
    return (context: EnvContext) => {
      const aspectId = CompilerAspect.id;
      const name = options.name || 'compiler-task';
      const depResolve = context.getAspect<any>('teambit.dependencies/dependency-resolver');
      return new CompilerTask(aspectId, name, options.compiler(context), depResolve);
    };
  }
}
