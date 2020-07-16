import path from 'path';
import execa from 'execa';
import fs from 'fs-extra';
import LegacyScope from '../../scope/scope';
// @ts-ignore (for some reason the tsc -w not found this)
import { ScopeNotFound } from './exceptions/scope-not-found';
import { IsolatorExtension } from '../isolator';
import GeneralError from '../../error/general-error';
import IsolatedEnvironment from '../../environment';
import { ComponentID } from '../component';

export type PackResult = {
  pkgJson: Record<any, string>;
  tarPath: string;
};

export type PackOptions = {
  outDir?: string;
  prefix?: boolean;
  override?: boolean;
  keep?: boolean;
  useCapsule?: boolean;
  loadScopeFromCache?: boolean;
};

export class Packer {
  options: PackOptions;
  constructor(private isolator: IsolatorExtension, private scope?: LegacyScope) {}

  async packComponent(componentId: string, scopePath: string | undefined, options: PackOptions): Promise<PackResult> {
    this.options = options;
    // By default do not load scope from cache when packing
    const loadScopeFromCache =
      options && options.loadScopeFromCache !== undefined ? !!options.loadScopeFromCache : false;
    const scope = scopePath ? await LegacyScope.load(scopePath, loadScopeFromCache) : this.scope;
    if (!scope) {
      throw new ScopeNotFound(scopePath);
    }
    if (this.options.useCapsule) {
      return this.packUsingCapsule(componentId, scope);
    }
    return this.packLegacy(componentId, scope);
  }

  private async packLegacy(componentId: string, scope: LegacyScope) {
    const isolatedEnvironment = new IsolatedEnvironment(scope, undefined);
    await isolatedEnvironment.create();
    const isolatePath = isolatedEnvironment.path;
    const isolateOpts = {
      writeBitDependencies: true,
      createNpmLinkFiles: true,
      installPackages: false,
      noPackageJson: false,
      excludeRegistryPrefix: !this.options.prefix,
      saveDependenciesAsComponents: false
    };
    await isolatedEnvironment.isolateComponent(componentId, isolateOpts);
    const packResult = await this.runNpmPack(isolatePath);
    if (!this.options.keep) {
      await isolatedEnvironment.destroy();
    }
    return packResult;
  }

  private async packUsingCapsule(componentId: string, scope: LegacyScope) {
    const bitId = await scope.getParsedId(componentId);
    if (!bitId.hasScope()) {
      throw new GeneralError(`unable to find "${componentId}" in the scope, make sure the component is tagged first`);
    }
    const network = await this.isolator.createNetworkFromScope([componentId], scope);
    const capsule = network.capsules.getCapsuleIgnoreVersion(new ComponentID(bitId));
    if (!capsule) throw new Error(`capsule not found for ${componentId}`);
    return this.runNpmPack(capsule.wrkDir);
  }

  private async runNpmPack(pathToPack: string): Promise<PackResult> {
    const packDir = this.options.outDir || pathToPack;
    return npmPack(pathToPack, packDir, this.options.override);
  }
}

function readPackageJson(dir: string) {
  const pkgJson = fs.readJsonSync(path.join(dir, 'package.json'));
  return pkgJson;
}

async function npmPack(cwd: string, outputPath: string, override = false): Promise<PackResult> {
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
      throw new GeneralError(`directory "${outputPath}" already exists, use --override flag to override`);
    }
  }
  if (tgzOriginPath !== tarPath) {
    await fs.move(tgzOriginPath, tarPath);
  }
  return response;
}
