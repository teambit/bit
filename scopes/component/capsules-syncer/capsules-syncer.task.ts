import { BuildContext, BuiltTaskResult, BuildTask } from '@teambit/builder';
import path from 'path';
import { CompilerAspect } from '@teambit/compiler';
import { DevFilesMain } from '@teambit/dev-files';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import fs from 'fs-extra'

export class CapsulesSyncerTask implements BuildTask {
  readonly name = 'SyncComponents';
  readonly dependencies = [CompilerAspect.id]; // I can put my new task here. And compiler to the deps of this taks
  constructor(readonly aspectId: string, private devFiles: DevFilesMain,
    private dependencyResolver: DependencyResolverMain,
  ) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    if (!this.dependencyResolver.config.rootComponents) return {
      artifacts: [],
      componentsResults: [],
    };
    await Promise.all(context.capsuleNetwork.seedersCapsules.map(async (capsule) => {
      const relCompDir = path.relative(context.capsuleNetwork.capsulesRootDir, capsule.path).replace(/\\/g, '/');
      const injectedDirs = await this.dependencyResolver.getInjectedDirs(
        context.capsuleNetwork.capsulesRootDir,
        relCompDir,
        componentIdToPackageName(capsule.component.state._consumer)
      );
      return hardLinkDirectory(capsule.path,
        injectedDirs.map((injectedDir) =>
          path.join(context.capsuleNetwork.capsulesRootDir, injectedDir)
        )
      );
    }))
    return {
      artifacts: [],
      componentsResults: [],
    };
  }
}

async function hardLinkDirectory(src: string, destDirs: string[]) {
  const files = fs.readdirSync(src);
  await Promise.all(files.map((file) => {
    if (file === 'node_modules') return;
    const srcFile = path.join(src, file);
    if ((await fs.lstat(srcFile)).isDirectory()) {
      return Promise.all(destDirs.map((destDir) => {
        const destFile = path.join(destDir, file);
        try {
          await fs.mkdir(destFile);
        } catch (err: any) {
          if (err.code !== 'EEXIST') throw err;
        }
        return hardLinkDirectory(srcFile, [destFile]);
      }));
    }
    return Promise.all(destDirs.map((destDir) => {
      const destFile = path.join(destDir, file);
      try {
        return fs.link(srcFile, destFile);
      } catch (err: any) {
        if (err.code !== 'EEXIST') throw err;
      }
    }));
  })
