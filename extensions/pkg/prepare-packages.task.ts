import { BuildContext, BuiltTaskResult, BuildTask } from '@teambit/builder';
import { Compiler } from '@teambit/compiler';
import { Capsule } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import PackageJsonFile from 'bit-bin/dist/consumer/component/package-json-file';
import fs from 'fs-extra';
import path from 'path';

const NPM_IGNORE_FILE = '.npmignore';

/**
 * prepare packages for publishing.
 */
export class PreparePackagesTask implements BuildTask {
  readonly description = 'prepare packages';
  constructor(readonly id: string, private logger: Logger) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const artifacts = await this.executeNpmIgnoreTask(context);

    const result = {
      componentsResults: [],
      artifacts,
    };

    return result;
  }

  /**
   * add .npmignore file in the capsule root with entries received from the compilers to avoid
   * adding them into the package.
   */
  private async executeNpmIgnoreTask(context: BuildContext): Promise<any[]> {
    if (!context.env.getCompiler) return [];
    const compilerInstance: Compiler = context.env.getCompiler();
    if (!compilerInstance || !compilerInstance.getNpmIgnoreEntries) return [];
    const npmIgnoreEntries = compilerInstance.getNpmIgnoreEntries();
    if (!npmIgnoreEntries || !npmIgnoreEntries.length) return [];
    const capsules = context.capsuleGraph.seedersCapsules;
    await Promise.all(capsules.map((capsule) => this.appendNpmIgnoreEntriesToCapsule(capsule, npmIgnoreEntries)));
    return [{ fileName: NPM_IGNORE_FILE }];
  }

  private async appendNpmIgnoreEntriesToCapsule(capsule: Capsule, npmIgnoreEntries: string[]) {
    const npmIgnorePath = path.join(capsule.path, NPM_IGNORE_FILE);
    const npmIgnoreEntriesStr = `${npmIgnoreEntries.join('\n')}\n`;
    await fs.appendFile(npmIgnorePath, npmIgnoreEntriesStr);
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
    const distDir = compilerInstance.getDistDir();

    await Promise.all(
      context.capsuleGraph.capsules.map(async (capsule) => {
        await this.removeSourceFiles(capsule.capsule, distDir);
        await this.moveDistToRoot(capsule.capsule, distDir);
        await this.updatePackageJson(capsule.capsule, compilerInstance, distDir);
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
