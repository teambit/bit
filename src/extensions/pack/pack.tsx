import path from 'path';
import execa from 'execa';
import fs from 'fs-extra';
import { Isolator } from '../isolator';
import LegacyScope from '../../scope/scope';
import IsolatedEnvironment from '../../environment';
// @ts-ignore (for some reason the tsc -w not found this)
import { ScopeNotFound } from './exceptions/scope-not-found';

import { BitId } from '../../bit-id';

export class Packer {
  constructor(private isolator: Isolator, private scope?: LegacyScope) {}

  async packComponent(
    componentId: string,
    scopePath: string | undefined,
    outDir: string,
    prefix = false,
    override = false,
    keep = false
  ) {
    const scope = scopePath ? await LegacyScope.load(scopePath) : this.scope;
    if (!scope) {
      throw new ScopeNotFound(scopePath);
    }
    const componentBitId = BitId.parse(componentId);
    const network = await this.isolator.createNetworkFromScope([componentBitId.toString()], scope, {
      excludeRegistryPrefix: !prefix,
      createNpmLinkFiles: true
    });
    const idAndCapsule = network.capsules.find(c => {
      if (componentBitId.name && componentBitId.version === 'latest') {
        return c.id.name === componentBitId.name; // TODO: maxSatisfying semver version
      }
      if (componentBitId.name && componentBitId.version) {
        return c.id.name === componentBitId.name && c.id.version === componentBitId.version;
      }
      return c.id.name === componentBitId.name; // TODO: maxSatisfying semver version
    });
    const capsule = idAndCapsule!.value;
    outDir = outDir || capsule.wrkDir;
    const packResult = await npmPack(capsule.wrkDir, outDir, override);
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
