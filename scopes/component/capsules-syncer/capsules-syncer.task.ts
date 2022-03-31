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
      hardLinkDirectory(capsule.path,
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

function hardLinkDirectory(src: string, destDirs: string[]) {
  const files = fs.readdirSync(src);
  for (const file of files) {
    if (file !== 'node_modules') {
      const srcFile = path.join(src, file);
      if (fs.lstatSync(srcFile).isDirectory()) {
        for (const dest of destDirs) {
          const destFile = path.join(dest, file);
          try {
            fs.mkdirSync(destFile);
          } catch (err: any) {
            if (err.code !== 'EEXIST') throw err;
          }
          hardLinkDirectory(srcFile, [destFile]);
        }
      } else {
        for (const dest of destDirs) {
          const destFile = path.join(dest, file);
          try {
            fs.linkSync(srcFile, destFile);
          } catch (err: any) {
            if (err.code !== 'EEXIST') throw err;
          }
        }
      }
    }
  }
}
