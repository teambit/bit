import path from 'path';
import execa from 'execa';
import fs from 'fs-extra';
import LegacyScope from '../../scope/scope';
// @ts-ignore (for some reason the tsc -w not found this)
import { ScopeNotFound } from './exceptions/scope-not-found';
import { IsolatorExtension } from '../isolator';
import GeneralError from '../../error/general-error';
import { ComponentID } from '../component';

export type PackResult = {
  pkgJson: Record<any, string>;
  tarPath: string;
};

export class Packer {
  constructor(private isolator: IsolatorExtension, private scope?: LegacyScope) {}

  async packComponent(
    componentId: string,
    scopePath: string | undefined,
    outDir: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    prefix = false,
    override = false
  ): Promise<PackResult> {
    const scope = scopePath ? await LegacyScope.load(scopePath) : this.scope;
    if (!scope) {
      throw new ScopeNotFound(scopePath);
    }
    const bitId = await scope.getParsedId(componentId);
    if (!bitId.hasScope()) {
      throw new GeneralError(`unable to find "${componentId}" in the scope, make sure the component is tagged first`);
    }
    const network = await this.isolator.createNetworkFromScope([componentId], scope);
    const capsule = network.capsules.getCapsuleIgnoreVersion(new ComponentID(bitId));
    if (!capsule) throw new Error(`capsule not found for ${componentId}`);
    const capsulePath = capsule.wrkDir;
    const packDir = outDir || capsulePath;
    const packResult = await npmPack(capsulePath, packDir, override);
    return packResult;
  }
}

function readPackageJson(outDir) {
  const pkgJson = fs.readJsonSync(path.join(outDir, 'package.json'));
  return pkgJson;
}

async function npmPack(cwd: string, outputPath: string, override = false) {
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
