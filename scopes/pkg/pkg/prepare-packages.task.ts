import { BuildContext, BuiltTaskResult, BuildTask } from '@teambit/builder';
import { Compiler } from '@teambit/compiler';
import { Capsule } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import PackageJsonFile from '@teambit/legacy/dist/consumer/component/package-json-file';
import fs from 'fs-extra';
import path from 'path';

/**
 * prepare packages for publishing.
 */
export class PreparePackagesTask implements BuildTask {
  readonly name = 'PreparePackages';
  readonly location = 'end';
  constructor(readonly aspectId: string, private logger: Logger) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const result = {
      componentsResults: [],
    };

    return result;
  }

  /**
   * remove the source files and copy the dists files
   * into the root of the capsule.
   * this is needed when components import from other components internal paths. without this task,
   * the internal paths are the source, so node will throw an error when trying to use them. this
   * task makes sure that the internal paths point to the consumable code (dists).
   */
  private async executeDistAsRootTask(context: BuildContext) {
    if (!context.env.getCompiler) return;
    const compilerInstance: Compiler = context.env.getCompiler();
    const distDir = compilerInstance.distDir;

    await Promise.all(
      context.capsuleNetwork.graphCapsules.map(async (capsule) => {
        await this.removeSourceFiles(capsule, distDir);
        await this.moveDistToRoot(capsule, distDir);
        await this.updatePackageJson(capsule, compilerInstance, distDir);
      })
    );
  }

  private async removeSourceFiles(capsule: Capsule, distDir: string) {
    const excludeDirs = [distDir, 'node_modules', 'public', 'bin'].map((dir) => `${dir}/**`);
    const excludeFiles = ['package.json'];
    const allFiles = capsule.getAllFilesPaths('.', { ignore: [...excludeDirs, ...excludeFiles] });
    this.logger.debug(`delete the following files:\n${allFiles.join('\n')}`);
    await Promise.all(allFiles.map((file) => fs.remove(path.join(capsule.path, file))));
  }

  private async moveDistToRoot(capsule: Capsule, distDir: string) {
    const from = path.join(capsule.path, distDir);
    const to = capsule.path;
    this.logger.debug(`move from ${from} to: ${to}`);
    // for some reason `fs.move` throws an error "dest already exists.".
    fs.moveSync(from, to);
  }

  /**
   * by default, the "main" prop points to the dist file (e.g. "dist/index./js").
   * here, we have to change it because there is no dist dir anymore.
   */
  private async updatePackageJson(capsule: Capsule, compiler: Compiler, distDir: string) {
    const distMainFile = compiler.getDistPathBySrcPath(capsule.component.state._consumer.mainFile);
    const distMainFileWithoutDistDir = distMainFile.replace(`${distDir}${path.sep}`, '');
    const packageJson = PackageJsonFile.loadFromCapsuleSync(capsule.path);
    packageJson.addOrUpdateProperty('main', distMainFileWithoutDistDir);
    await packageJson.write();
  }
}
