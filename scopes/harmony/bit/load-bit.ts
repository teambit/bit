/* eslint-disable import/no-dynamic-require */
/* eslint-disable import/first */
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('uncaughtException', err);
  process.exit(1);
});

process.env.BROWSERSLIST_IGNORE_OLD_DATA = 'true';

import './hook-require';

import type { AspectLoaderMain } from '@teambit/aspect-loader';
import {
  AspectLoaderAspect,
  getAspectDir,
  getAspectDistDir,
  getCoreAspectPackageName,
  getCoreAspectName,
} from '@teambit/aspect-loader';
import json from 'comment-json';
import userHome from 'user-home';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import { ConfigAspect, ConfigRuntime } from '@teambit/config';
import type { RuntimeDefinition, Extension, Aspect } from '@teambit/harmony';
import { Harmony } from '@teambit/harmony';
// TODO: expose this types from harmony (once we have a way to expose it only for node)
import { Config } from '@teambit/harmony/dist/harmony-config';
import { readConfigFile } from '@teambit/harmony/dist/harmony-config/config-reader';
import { VERSION_DELIMITER } from '@teambit/legacy-bit-id';
import { loadConsumer } from '@teambit/legacy.consumer';
import type { WorkspaceInfo } from '@teambit/workspace.modules.workspace-locator';
import { getWorkspaceInfo } from '@teambit/workspace.modules.workspace-locator';
import { BitMap } from '@teambit/legacy.bit-map';
import { BitError } from '@teambit/bit-error';
import { ComponentLoader } from '@teambit/legacy.consumer-component';
import { LegacyWorkspaceConfig, ComponentOverrides, ComponentConfig } from '@teambit/legacy.consumer-config';
import { PackageJsonTransformer } from '@teambit/workspace.modules.node-modules-linker';
import { satisfies } from 'semver';
import { getBitVersion } from '@teambit/bit.get-bit-version';
import { ClearCacheAspect } from '@teambit/clear-cache';
import { ExtensionDataList } from '@teambit/legacy.extension-data';
import { ComponentIdList, ComponentID } from '@teambit/component-id';
import { findScopePath } from '@teambit/scope.modules.find-scope-path';
import { logger } from '@teambit/legacy.logger';
import { ExternalActions } from '@teambit/legacy.scope-api';
import { readdir, readFile } from 'fs-extra';
import { resolve, join } from 'path';
import { getAllCoreAspectsIds, isCoreAspect, getManifestsMap } from './manifests';
import { BitAspect } from './bit.aspect';
import { registerCoreExtensions } from './bit.main.runtime';
import type { BitConfig } from './bit.provider';
import type { EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import type { GeneratorMain } from '@teambit/generator';
import { GeneratorAspect } from '@teambit/generator';
import { HostInitializerMain } from '@teambit/host-initializer';

const manifestsMap = getManifestsMap();

async function loadLegacyConfig(config: any) {
  const aspectsToLoad = [getConfigAspect()];
  const harmony = await Harmony.load(aspectsToLoad, ConfigRuntime.name, config.toObject());
  // await harmony.run(async (aspect: Extension, runtime: RuntimeDefinition) => requireAspects(aspect, runtime));
  await harmony.run();
}

async function getConfig(cwd = process.cwd()) {
  const consumerInfo = await getWorkspaceInfo(cwd);
  if (consumerInfo && !consumerInfo.hasScope && consumerInfo.hasBitMap && consumerInfo.hasWorkspaceConfig) {
    await HostInitializerMain.init(consumerInfo.path);
  }
  const scopePath = findScopePath(cwd);

  let wsConfig;
  if (consumerInfo) {
    wsConfig = await getWsConfig(consumerInfo.path);
    attachVersionsFromBitmap(wsConfig, consumerInfo);
  }

  let scopeConfig;
  if (scopePath && !consumerInfo) {
    const scopeConfigPath = join(scopePath, 'scope.jsonc');
    scopeConfig = await readConfigFile(scopeConfigPath, false);
  }

  const globalConfigPath = join(userHome, '.bitrc.jsonc');
  const globalConfig = await readConfigFile(globalConfigPath, false);
  // We don't use the harmonyConfig.loadGlobal as we want to manually merge it in a better way
  // harmony merge will prioritize the global config over the workspace config
  // and won't know to handle the dependency resolver config merge
  const mergedConfig = mergeConfigs(globalConfig, wsConfig, scopeConfig);

  return new Config(mergedConfig);
}

function mergeConfigs(
  globalConfig: Record<string, any> = {},
  workspaceConfig?: Record<string, any>,
  scopeConfig?: Record<string, any>
) {
  const hostConfig = workspaceConfig || scopeConfig || {};
  // merge the dependency resolver from the global config with the workspace/scope config
  const depsResolver = json.assign(
    globalConfig['teambit.dependencies/dependency-resolver'] || {},
    hostConfig['teambit.dependencies/dependency-resolver'] || {}
  );
  const mergedConfig = json.assign(globalConfig, hostConfig);
  json.assign(mergedConfig, { 'teambit.dependencies/dependency-resolver': depsResolver });
  return mergedConfig;
}

async function getWsConfig(consumerPath: string) {
  try {
    const config = await readConfigFile(join(consumerPath, 'workspace.jsonc'), false);
    return config;
  } catch (err: any) {
    // file is there. otherwise, readConfigFile wouldn't throw.
    const wsPath = join(consumerPath, 'workspace.jsonc');
    const fileContent = await readFile(wsPath, 'utf-8');
    // if it has conflicts markers, ask the user to fix them
    if (fileContent.includes('<<<<<<<') || fileContent.includes('>>>>>>>')) {
      throw new Error(`please fix the conflicts in workspace.jsonc to continue`);
    }
    if (err.constructor.name === 'ReadConfigError' && err.err?.message) {
      const location = err.err.line && err.err.column ? ` (${err.err.line}:${err.err.column})` : '';
      throw new Error(`failed parsing the workspace.jsonc file at ${wsPath}. error: ${err.err.toString()}${location}`);
    }
    throw err;
  }
}

/**
 * This will attach versions of aspects configured in the config without version by resolves them from the bitmap file
 * It's required in order to support a usecase which you develop a local aspect and configure it in your workspace.jsonc
 * in that case you always want the workspace.jsonc config to be linked to your local aspect
 * but you don't want to change your workspace.jsonc version after each tag of the aspect
 * @param config
 */
function attachVersionsFromBitmap(rawConfig: Record<string, any>, consumerInfo: WorkspaceInfo): Record<string, any> {
  if (!consumerInfo || !consumerInfo.hasBitMap || !consumerInfo.hasWorkspaceConfig) {
    return rawConfig;
  }
  const rawBitmap = BitMap.loadRawSync(consumerInfo.path);
  let parsedBitMap = {};
  try {
    parsedBitMap = rawBitmap ? (json.parse(rawBitmap?.toString('utf8'), undefined, true) as Record<string, any>) : {};
    // @todo: remove this if statement once we don't need the migration of the bitmap file for lanes
    // @ts-ignore
    if (parsedBitMap?._bit_lane?.name) {
      // backward compatibility. if "_bit_land" has the old format, then, later, when the bitmap is loaded again,
      // it'll take care of the migration.
      parsedBitMap = {};
    }
    BitMap.removeNonComponentFields(parsedBitMap);
    // Do nothing here, invalid bitmaps will be handled later
    // eslint-disable-next-line no-empty
  } catch {}
  const wsConfig = rawConfig['teambit.workspace/workspace'];
  if (!wsConfig) throw new BitError('workspace.jsonc is missing the "teambit.workspace/workspace" property');
  const defaultScope = wsConfig.defaultScope;
  if (!defaultScope)
    throw new BitError('workspace.jsonc is missing the "defaultScope" property in "teambit.workspace/workspace"');
  const allBitmapIds = Object.keys(parsedBitMap).map((id) =>
    BitMap.getComponentIdFromComponentJson(id, parsedBitMap[id], defaultScope)
  );
  const bitMapBitIds = ComponentIdList.fromArray(allBitmapIds);
  const result = Object.entries(rawConfig).reduce((acc, [aspectId, aspectConfig]) => {
    let newAspectEntry = aspectId;
    // In case the id already has a version we don't want to get it from the bitmap
    // We also don't want to add versions for core aspects
    if (!aspectId.includes(VERSION_DELIMITER) && !manifestsMap[aspectId]) {
      const versionFromBitmap = getVersionFromBitMapIds(bitMapBitIds, aspectId);
      if (versionFromBitmap) {
        newAspectEntry = `${aspectId}${VERSION_DELIMITER}${versionFromBitmap}`;
      }
    }
    acc[newAspectEntry] = aspectConfig;
    return acc;
  }, {});
  return result;
}

function getVersionFromBitMapIds(allBitmapIds: ComponentIdList, aspectId: string): string | undefined {
  let aspectBitId: ComponentID;
  try {
    aspectBitId = ComponentID.fromString(aspectId);
  } catch {
    throw new Error(
      `unable to parse the component-id "${aspectId}" from the workspace.jsonc file, make sure this is a component id`
    );
  }
  // start by searching id in the bitmap with exact match (including scope name)
  // in case the aspect is not exported yet, it will be in the bitmap without a scope,
  // while in the aspect id it will have the default scope
  const found =
    allBitmapIds.searchWithoutVersion(aspectBitId) || allBitmapIds.searchWithoutScopeAndVersion(aspectBitId);
  return found && found.hasVersion() ? found.version : undefined;
}

export async function requireAspects(aspect: Extension, runtime: RuntimeDefinition) {
  const id = aspect.name;
  if (!id) throw new Error('could not retrieve aspect id');
  const isCore = isCoreAspect(id);
  const dirPath = getAspectDistDir(id, isCore);
  const files = await readdir(dirPath);
  const runtimeFile = files.find((file) => file.includes(`.${runtime.name}.runtime.js`));
  if (!runtimeFile) return;
  // eslint-disable-next-line
  require(resolve(`${dirPath}/${runtimeFile}`));
}

function getMainAspect() {
  const packageName = getCoreAspectPackageName(BitAspect.id);
  let version: string | undefined;
  let mainAspectDir = '';
  try {
    mainAspectDir = getAspectDir(BitAspect.id);
    // eslint-disable-next-line global-require
    const packageJson = require(`${mainAspectDir}/package.json`);
    version = packageJson.version;
  } catch {
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

/**
 * Bit may crush during the aspect loading phase or workspace/consumer initialization.
 * normally, this is the desired behavior, however, some commands are there to help overcome these
 * errors, such as "bit clear-cache". for these commands we're better off loading the bare minimum,
 * which is only the CLI aspect.
 *
 * at this stage we don't have the commands objects, so we can't check the command/flags from there
 * instead, we have to check the `process.argv.` directly instead, which is not 100% accurate.
 */
function shouldLoadInSafeMode() {
  const currentCommand = process.argv[2];
  // harmony commands need the aspects to be loaded and register to the CLI aspect in order to work properly.
  const commandsThatCanRunInSafeMode = [
    'dependents',
    'remote',
    'doctor',
    'cat-version-history',
    'cat-component',
    'cat-scope',
    'cat-object',
    'config',
    'run-action',
  ];
  const hasSafeModeFlag = process.argv.includes('--safe-mode');
  return isClearCacheCommand() || (hasSafeModeFlag && commandsThatCanRunInSafeMode.includes(currentCommand));
}

function isClearCacheCommand() {
  return process.argv[2] === 'clear-cache' || process.argv[2] === 'cc';
}

function shouldRunAsDaemon() {
  return process.env.BIT_DAEMON === 'true';
}

export async function loadBit(path = process.cwd(), additionalAspects?: Aspect[]) {
  clearGlobalsIfNeeded();
  logger.info(`*** Loading Bit *** argv:\n${process.argv.join('\n')}`);
  const config = await getConfig(path);
  registerCoreExtensions();
  await loadLegacyConfig(config);
  const configMap = config.toObject();
  configMap[BitAspect.id] ||= {};
  configMap[BitAspect.id].cwd = path;
  verifyEngine(configMap[BitAspect.id]);

  const aspectsToLoad = [CLIAspect];
  if (additionalAspects) additionalAspects.forEach((aspect) => aspectsToLoad.push(aspect));
  const loadCLIOnly = shouldLoadInSafeMode();
  if (isClearCacheCommand()) aspectsToLoad.push(ClearCacheAspect);
  if (!loadCLIOnly) {
    // aspectsToLoad.push(BitAspect);
    aspectsToLoad.push(...Object.values(manifestsMap));
  }
  if (shouldRunAsDaemon()) {
    logger.isDaemon = true;
  }
  const harmony = await Harmony.load(aspectsToLoad, MainRuntime.name, configMap);
  await harmony.run(async (aspect: Extension, runtime: RuntimeDefinition) => requireAspects(aspect, runtime));
  if (loadCLIOnly) return harmony;
  const aspectLoader = harmony.get<AspectLoaderMain>(AspectLoaderAspect.id);
  aspectLoader.setCoreAspects(Object.values(manifestsMap));
  aspectLoader.setNonCoreAspects(additionalAspects || []);
  aspectLoader.setMainAspect(getMainAspect());
  const envs = harmony.get<EnvsMain>(EnvsAspect.id);
  envs.setCoreAspectIds(getAllCoreAspectsIds());
  const generator = harmony.get<GeneratorMain>(GeneratorAspect.id);
  generator.setBitApi({
    loadBit,
    takeLegacyGlobalsSnapshot,
    restoreGlobalsFromSnapshot,
    isCoreAspect,
  });
  return harmony;
}

function verifyEngine(bitConfig: BitConfig) {
  if (!bitConfig.engine) {
    return;
  }
  const bitVersion = getBitVersion();
  if (satisfies(bitVersion, bitConfig.engine)) {
    return;
  }
  const msg = `your bit version "${bitVersion}" doesn't satisfies the required "${bitConfig.engine}" version
please run "bvm install ${bitConfig.engine}" to install and use a specific version of Bit.`;
  if (bitConfig.engineStrict) {
    throw new Error(`error: ${msg}`);
  }
  logger.console(msg, 'warn', 'yellow');
}

export async function runCLI(additionalAspects?: Aspect[]) {
  const harmony = await loadBit(undefined, additionalAspects);
  const cli = harmony.get<CLIMain>('teambit.harmony/cli');
  let hasWorkspace = true;
  try {
    harmony.get('teambit.workspace/workspace');
  } catch {
    hasWorkspace = false;
  }
  await cli.run(hasWorkspace);
}

export type LegacyGlobal = { classInstance: any; methodName: string; value: any; empty: any };

/**
 * loadBit may gets called multiple times (currently, it's happening during e2e-tests that call loadBit).
 * when it happens, the static methods in this function still have the callbacks that were added in
 * the previous loadBit call. this callbacks have the old data such as workspace/bitmap/consumer
 * of the previous workspace, which leads to hard-to-debug issues.
 */
function clearGlobalsIfNeeded() {
  if (!loadConsumer.cache && !PackageJsonTransformer.packageJsonTransformersRegistry.length) {
    return;
  }
  delete loadConsumer.cache;

  const legacyGlobals = takeLegacyGlobalsSnapshot();
  legacyGlobals.forEach((global) => {
    global.classInstance[global.methodName] = global.empty;
  });
}

export function takeLegacyGlobalsSnapshot(): LegacyGlobal[] {
  const legacyGlobals: LegacyGlobal[] = [
    {
      classInstance: ComponentLoader,
      methodName: 'onComponentLoadSubscribers',
      value: ComponentLoader.onComponentLoadSubscribers,
      empty: [],
    },
    {
      classInstance: ComponentOverrides,
      methodName: 'componentOverridesLoadingRegistry',
      value: ComponentOverrides.componentOverridesLoadingRegistry,
      empty: {},
    },
    {
      classInstance: ComponentConfig,
      methodName: 'componentConfigLoadingRegistry',
      value: ComponentConfig.componentConfigLoadingRegistry,
      empty: {},
    },
    {
      classInstance: PackageJsonTransformer,
      methodName: 'packageJsonTransformersRegistry',
      value: PackageJsonTransformer.packageJsonTransformersRegistry,
      empty: [],
    },
    { classInstance: ComponentLoader, methodName: 'loadDeps', value: ComponentLoader.loadDeps, empty: undefined },
    {
      classInstance: ExtensionDataList,
      methodName: 'toModelObjectsHook',
      value: ExtensionDataList.toModelObjectsHook,
      empty: [],
    },
    {
      classInstance: LegacyWorkspaceConfig,
      methodName: 'workspaceConfigLoadingRegistry',
      value: LegacyWorkspaceConfig.workspaceConfigLoadingRegistry,
      empty: undefined,
    },
    {
      classInstance: ExternalActions,
      methodName: 'externalActions',
      value: ExternalActions.externalActions,
      empty: [],
    },
  ];

  return legacyGlobals;
}

export function restoreGlobalsFromSnapshot(snapshot: LegacyGlobal[]) {
  snapshot.forEach((global) => {
    global.classInstance[global.methodName] = global.value;
  });
}
