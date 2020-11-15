/* eslint-disable import/no-dynamic-require */
/* eslint-disable import/first */
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('uncaughtException', err);
  process.exit(1);
});

require('v8-compile-cache');

import './hook-require';

import {
  getAspectDir,
  getAspectDistDir,
  AspectLoaderMain,
  getCoreAspectPackageName,
  getCoreAspectName,
} from '@teambit/aspect-loader';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ConfigAspect, ConfigRuntime } from '@teambit/config';
import { Harmony, RuntimeDefinition } from '@teambit/harmony';
import { Extension } from '@teambit/harmony/dist/extension';
import { Config } from '@teambit/harmony/dist/harmony-config';
// TODO: expose this type from harmony
import { ConfigOptions } from '@teambit/harmony/dist/harmony-config/harmony-config';
import { bootstrap } from 'bit-bin/dist/bootstrap';
import { handleErrorAndExit } from 'bit-bin/dist/cli/command-runner';
import { DependencyResolver } from 'bit-bin/dist/consumer/component/dependencies/dependency-resolver';
import { getConsumerInfo } from 'bit-bin/dist/consumer';
import { propogateUntil as propagateUntil } from 'bit-bin/dist/utils';
import { readdir } from 'fs-extra';
import { resolve } from 'path';
import { manifestsMap } from './manifests';
import { BitAspect } from './bit.aspect';
import { registerCoreExtensions } from './bit.main.runtime';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
initApp();

async function initApp() {
  try {
    await bootstrap();
    // registerCoreExtensions();
    // const harmony = await Harmony.load([ConfigExt], {});
    await runCLI();
  } catch (err) {
    const originalError = err.originalError || err;
    await handleErrorAndExit(originalError, process.argv[2]);
  }
}

async function loadLegacyConfig(config: any) {
  const harmony = await Harmony.load([ConfigAspect], ConfigRuntime.name, config.toObject());
  await harmony.run(async (aspect: Extension, runtime: RuntimeDefinition) => requireAspects(aspect, runtime));
}

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
  try {
    harmony.get('teambit.workspace/workspace');
    await cli.run(true);
  } catch (err) {
    await cli.run(false);
  }
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
