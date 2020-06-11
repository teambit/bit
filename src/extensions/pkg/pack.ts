import path from 'path';
import execa from 'execa';
import fs from 'fs-extra';
import LegacyScope from '../../scope/scope';
import IsolatedEnvironment from '../../environment';
// @ts-ignore (for some reason the tsc -w not found this)
import { ScopeNotFound } from './exceptions/scope-not-found';

export type PackResult = {
  pkgJson: Record<any, string>;
  tarPath: string;
};

export class Packer {
  constructor(private scope?: LegacyScope) {}

  async packComponent(
    componentId: string,
    scopePath: string | undefined,
    outDir: string,
    prefix = false,
    override = false,
    keep = false
  ): Promise<PackResult> {
    const scope = scopePath ? await LegacyScope.load(scopePath) : this.scope;
    if (!scope) {
      throw new ScopeNotFound(scopePath);
    }
    // TODO: change to use the new capsule
    const isolatedEnvironment = new IsolatedEnvironment(scope, undefined);
    await isolatedEnvironment.create();
    const isolatePath = isolatedEnvironment.path;
    const isolateOpts = {
      writeBitDependencies: true,
      createNpmLinkFiles: true,
      installPackages: false,
      noPackageJson: false,
      excludeRegistryPrefix: !prefix,
      saveDependenciesAsComponents: false
    };
    await isolatedEnvironment.isolateComponent(componentId, isolateOpts);
    outDir = outDir || isolatePath;
    const packResult = await npmPack(isolatePath, outDir, override);
    if (!keep) {
      await isolatedEnvironment.destroy();
    }
    return packResult;
  }
}

function readPackageJson(outDir) {
  const pkgJson = fs.readJsonSync(path.join(outDir, 'package.json'));
  return pkgJson;
}

async function npmPack(cwd, outputPath, override = false) {
  const result = await execa('npm', ['pack'], { cwd });
  const stdout = result.stdout;
  const tgzName = stdout.trim();
  const tgzOriginPath = path.join(cwd, tgzName);
  const pkgJson = readPackageJson(cwd);
  const tarPath = path.join(outputPath, tgzName);
  const response = {
    pkgJson,
    tarPath
  };
  if (tgzOriginPath !== tarPath && fs.pathExistsSync(tarPath)) {
    if (override) {
      fs.removeSync(tarPath);
    } else {
      throw new Error('File already exists');
    }
  }
  if (tgzOriginPath !== tarPath) {
    await fs.move(tgzOriginPath, tarPath);
  }
  return response;
}
