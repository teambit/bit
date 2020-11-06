import { readdir } from 'fs-extra';
import { resolve } from 'path';

import { Extension } from '@teambit/harmony/dist/extension';
import { Config } from '@teambit/harmony/dist/harmony-config';
import { Harmony, RuntimeDefinition } from '@teambit/harmony';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ConfigOptions } from '@teambit/harmony/dist/harmony-config/harmony-config';
import { ConfigAspect, ConfigRuntime } from '@teambit/config';
import {
  getAspectDir,
  getAspectDistDir,
  AspectLoaderMain,
  getCoreAspectPackageName,
  getCoreAspectName,
} from '@teambit/aspect-loader';

import { bootstrap } from 'bit-bin/dist/bootstrap';
import { getConsumerInfo } from 'bit-bin/dist/consumer';
import { propogateUntil as propagateUntil } from 'bit-bin/dist/utils';
import { registerCoreExtensions } from '@teambit/bit/bit.main.runtime';
import { BitAspect } from '@teambit/bit';
import { manifestsMap } from '@teambit/bit/manifests';
import { DependencyResolver } from 'bit-bin/dist/consumer/component/dependencies/dependency-resolver';

async function getConfig() {
  const cwd = process.cwd();
  const consumerInfo = await getConsumerInfo(cwd);
  const scopePath = propagateUntil(cwd);
  const globalConfigOpts = {
    name: '.bitrc.jsonc',
  };
  const configOpts: ConfigOptions = {
    global: globalConfigOpts,
    shouldThrow: false,
    cwd: consumerInfo?.path || scopePath,
  };

  if (consumerInfo) {
    return Config.load('workspace.jsonc', configOpts);
  }

  if (scopePath && !consumerInfo) {
    return Config.load('scope.jsonc', configOpts);
  }

  return Config.loadGlobal(globalConfigOpts);
}

export async function requireAspects(aspect: Extension, runtime: RuntimeDefinition) {
  const id = aspect.name;
  if (!id) throw new Error('could not retrieve aspect id');
  const dirPath = getAspectDistDir(id);
  const files = await readdir(dirPath);
  const runtimeFile = files.find((file) => file.includes(`.${runtime.name}.runtime.js`));
  if (!runtimeFile) return;
  // eslint-disable-next-line
  require(resolve(`${dirPath}/${runtimeFile}`));
}

function getMainAspect() {
  const mainAspectDir = getAspectDir(BitAspect.id);
  let version: string | undefined;
  const packageName = getCoreAspectPackageName(BitAspect.id);

  try {
    // eslint-disable-next-line global-require
    const packageJson = require(`${mainAspectDir}/package.json`);
    version = packageJson.version;
  } catch (err) {
    version = undefined;
  }

  return {
    path: mainAspectDir,
    version,
    packageName,
    aspect: BitAspect,
    name: getCoreAspectName(BitAspect.id),
    id: BitAspect.id,
  };
}

function registerCoreAspectsToLegacyDepResolver(aspectLoader: AspectLoaderMain) {
  const allCoreAspectsIds = aspectLoader.getCoreAspectIds();
  const coreAspectsPackagesAndIds = {};

  allCoreAspectsIds.forEach((id) => {
    const packageName = getCoreAspectPackageName(id);
    coreAspectsPackagesAndIds[packageName] = id;
  });
  // @ts-ignore
  DependencyResolver.getCoreAspectsPackagesAndIds = () => coreAspectsPackagesAndIds;
}

async function loadLegacyConfig(config: any) {
  const harmony = await Harmony.load([ConfigAspect], ConfigRuntime.name, config.toObject());
  await harmony.run(async (aspect: Extension, runtime: RuntimeDefinition) => requireAspects(aspect, runtime));
}

async function runCLI() {
  const config = await getConfig();
  registerCoreExtensions();
  await loadLegacyConfig(config);
  const harmony = await Harmony.load([CLIAspect, BitAspect], MainRuntime.name, config.toObject());
  await harmony.run(async (aspect: Extension, runtime: RuntimeDefinition) => requireAspects(aspect, runtime));

  const aspectLoader = harmony.get<AspectLoaderMain>('teambit.harmony/aspect-loader');
  aspectLoader.setCoreAspects(Object.values(manifestsMap));
  aspectLoader.setMainAspect(getMainAspect());
  registerCoreAspectsToLegacyDepResolver(aspectLoader);
  const cli = harmony.get<CLIMain>('teambit.harmony/cli');
  await cli.run();
  return harmony;
}

export const init = async () => {
  try {
    await bootstrap();
    const harmony = await runCLI();
    return harmony;
  } catch (err) {
    const originalError = err.originalError || err;
    console.log(originalError);
    console.error(originalError);
    // await handleErrorAndExit(originalError, process.argv[2]);
  }
};
