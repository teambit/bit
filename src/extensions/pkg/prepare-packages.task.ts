import fs from 'fs-extra';
import path from 'path';
import { BuildContext } from '../builder';
import { BuildTask, BuildResults } from '../builder';
import { Logger } from '../logger';
import { Compiler } from '../compiler';
import { Capsule } from '../isolator';
import PackageJsonFile from '../../consumer/component/package-json-file';

/**
 * prepare packages for publishing. practically. remove the source files and copy the dists files
 * into the root of the capsule.
 * this is needed when components import from other components internal paths. without this task,
 * the internal paths are the source, so node will throw an error when trying to use them. this
 * task makes sure that the internal paths point to the consumable code (dists).
 */
export class PreparePackagesTask implements BuildTask {
  readonly description = '';
  constructor(readonly extensionId: string, private logger: Logger) {}

  async execute(context: BuildContext): Promise<BuildResults> {
    const result = {
      components: [],
      artifacts: [],
    };
    if (!context.env.getCompiler) return result;
    const compilerInstance: Compiler = context.env.getCompiler();
    const distDir = compilerInstance.getDistDir();

    await Promise.all(
      context.capsuleGraph.capsules.map(async (capsule) => {
        await this.removeSourceFiles(capsule.capsule, distDir);
        await this.moveDistToRoot(capsule.capsule, distDir);
        await this.updatePackageJson(capsule.capsule, compilerInstance, distDir);
      })
    );

    return result;
  }

  async removeSourceFiles(capsule: Capsule, distDir: string) {
    const excludeDirs = [distDir, 'node_modules', 'public', 'bin'].map((dir) => `${dir}/**`);
    const excludeFiles = ['package.json'];
    const allFiles = capsule.getAllFilesPaths('.', { ignore: [...excludeDirs, ...excludeFiles] });
    this.logger.debug(`delete the following files:\n${allFiles.join('\n')}`);
    await Promise.all(allFiles.map((file) => fs.remove(path.join(capsule.path, file))));
  }

  async moveDistToRoot(capsule: Capsule, distDir: string) {
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
  async updatePackageJson(capsule: Capsule, compiler: Compiler, distDir: string) {
    const distMainFile = compiler.getDistPathBySrcPath(capsule.component.state._consumer.mainFile);
    const distMainFileWithoutDistDir = distMainFile.replace(`${distDir}${path.sep}`, '');
    const packageJson = PackageJsonFile.loadFromCapsuleSync(capsule.path);
    packageJson.addOrUpdateProperty('main', distMainFileWithoutDistDir);
    await packageJson.write();
  }
}
