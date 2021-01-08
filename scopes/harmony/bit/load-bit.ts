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
import json from 'comment-json';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { ConfigAspect, ConfigRuntime } from '@teambit/config';
import { Harmony, RuntimeDefinition } from '@teambit/harmony';
import { Extension } from '@teambit/harmony/dist/extension';
import { Config } from '@teambit/harmony/dist/harmony-config';
// TODO: expose this type from harmony
import { ConfigOptions } from '@teambit/harmony/dist/harmony-config/harmony-config';
import { VERSION_DELIMITER } from '@teambit/legacy-bit-id';
import { DependencyResolver } from 'bit-bin/dist/consumer/component/dependencies/dependency-resolver';
import { getConsumerInfo } from 'bit-bin/dist/consumer';
import { ConsumerInfo } from 'bit-bin/dist/consumer/consumer-locator';
import BitMap from 'bit-bin/dist/consumer/bit-map';
import { propogateUntil as propagateUntil } from 'bit-bin/dist/utils';
import { readdir } from 'fs-extra';
import { resolve } from 'path';
import { manifestsMap } from './manifests';
import { BitAspect } from './bit.aspect';
import { registerCoreExtensions } from './bit.main.runtime';

async function loadLegacyConfig(config: any) {
  const harmony = await Harmony.load([ConfigAspect], ConfigRuntime.name, config.toObject());
  await harmony.run(async (aspect: Extension, runtime: RuntimeDefinition) => requireAspects(aspect, runtime));
}

async function getConfig(cwd = process.cwd()) {
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
    const config = Config.load('workspace.jsonc', configOpts);
    return attachVersionsFromBitmap(config, consumerInfo);
  }

  if (scopePath && !consumerInfo) {
    return Config.load('scope.jsonc', configOpts);
  }

  return Config.loadGlobal(globalConfigOpts);
}

/**
 * This will attach versions of aspects configured in the config without version by resolves them from the bitmap file
 * It's required in order to support a usecase which you develop a local aspect and configure it in your workspace.jsonc
 * in that case you always want the workspace.jsonc config to be linked to your local aspect
 * but you don't want to change your workspace.jsonc version after each tag of the aspect
 * @param config
 */
function attachVersionsFromBitmap(config: Config, consumerInfo: ConsumerInfo): Config {
  if (!consumerInfo || !consumerInfo.hasBitMap) {
    return config;
  }
  const rawConfig = config.toObject();
  const rawBitmap = BitMap.loadRawSync(consumerInfo.path);
  let parsedBitMap = {};
  try {
    parsedBitMap = rawBitmap ? json.parse(rawBitmap?.toString('utf8'), undefined, true) : {};
    // Do nothing here, invalid bitmaps will be handled later
    // eslint-disable-next-line no-empty
  } catch (e) {}
  const allBitmapIds = Object.keys(parsedBitMap);
  const result = Object.entries(rawConfig).reduce((acc, [aspectId, aspectConfig]) => {
    let newAspectEntry = aspectId;
    // In case the id already has a version we don't want to get it from the bitmap
    // We also don't want to add versions for core aspects
    if (!aspectId.includes(VERSION_DELIMITER) && !manifestsMap[aspectId]) {
      const versionFromBitmap = getVersionFromBitMapIds(allBitmapIds, aspectId);
      if (versionFromBitmap) {
        newAspectEntry = `${aspectId}${VERSION_DELIMITER}${versionFromBitmap}`;
      }
    }
    acc[newAspectEntry] = aspectConfig;
    return acc;
  }, {});
  return new Config(result);
}

function getVersionFromBitMapIds(allBitmapIds: string[], aspectId: string): string | undefined {
  // Start by searching id in the bitmap with exact match (including scope name)
  const exactMatch = allBitmapIds.find((id: string) => {
    const idWithoutVersion = id.split(VERSION_DELIMITER)[0];
    return idWithoutVersion === aspectId;
  });
  if (exactMatch) {
    return exactMatch.split(VERSION_DELIMITER)[1];
  }

  // In case the aspect is not exported yet, it will be in the bitmap without a scope, while in the aspect id it will have the default scope
  const withoutScopeMatch = allBitmapIds.find((id: string) => {
    const idWithoutVersion = id.split(VERSION_DELIMITER)[0];
    const aspectWithoutScope = id.substring(id.indexOf('/') + 1);
    return idWithoutVersion === aspectWithoutScope;
  });
  if (withoutScopeMatch) {
    return withoutScopeMatch.split(VERSION_DELIMITER)[1];
  }
  return undefined;
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

export async function loadBit(path = process.cwd()) {
  const config = await getConfig(path);
  registerCoreExtensions();
  await loadLegacyConfig(config);
  const configMap = config.toObject();

  configMap['teambit.harmony/bit'] = {
    cwd: path,
  };

  const harmony = await Harmony.load([CLIAspect, BitAspect], MainRuntime.name, configMap);
  await harmony.run(async (aspect: Extension, runtime: RuntimeDefinition) => requireAspects(aspect, runtime));

  const aspectLoader = harmony.get<AspectLoaderMain>('teambit.harmony/aspect-loader');
  aspectLoader.setCoreAspects(Object.values(manifestsMap));
  aspectLoader.setMainAspect(getMainAspect());
  registerCoreAspectsToLegacyDepResolver(aspectLoader);
  return harmony;
}

export async function runCLI() {
  const harmony = await loadBit();
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
