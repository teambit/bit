/* eslint-disable import/first */
// eslint-disable-next-line no-console
process.on('uncaughtException', (err) => console.log('uncaughtException', err));

import './hook-require';
import { Config } from '@teambit/harmony/dist/harmony-config';
import { Extension } from '@teambit/harmony/dist/extension';
import { resolve, join } from 'path';
import { readdir } from 'fs-extra';
import { Harmony, RuntimeDefinition } from '@teambit/harmony';
import { handleErrorAndExit } from '../../cli/command-runner';
import { BitAspect, registerCoreExtensions } from '../bit';
import { bootstrap } from '../../bootstrap';
import { HarmonyConfig } from '../../components/modules/harmony-config';
import { getConsumerInfo } from '../../consumer';
import { propogateUntil as propagateUntil } from '../../utils';
import { ConfigAspect, ConfigRuntime } from '../config';
import { CLIAspect, MainRuntime } from './cli.aspect';
import { CLIMain } from './cli.main.runtime';

initApp();

async function initApp() {
  try {
    await bootstrap();
    // registerCoreExtensions();
    // const harmony = await Harmony.load([ConfigExt], {});
    await runCLI();
  } catch (err) {
    const originalError = err.originalError || err;
    handleErrorAndExit(originalError, process.argv[2]);
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
  const configOpts = {
    global: {
      name: '.bitrc.jsonc',
    },
    shouldThrow: false,
  };

  if (consumerInfo) {
    return Config.load('workspace.jsonc', configOpts);
  }

  if (scopePath && !consumerInfo) {
    return Config.load('scope.jsonc', configOpts);
  }

  return Config.loadGlobal(configOpts.global);
}

async function requireAspects(aspect: Extension, runtime: RuntimeDefinition) {
  const id = aspect.name;
  const aspectName = id.split('/')[1];
  if (!aspectName) throw new Error('could not retrieve aspect name');
  const moduleDirectory = require.resolve(`@teambit/${aspectName}`);
  const dirPath = join(moduleDirectory, '..'); // to remove the "index.js" at the end
  const files = await readdir(dirPath);
  const runtimeFile = files.find((file) => file.includes(`.${runtime.name}.runtime.`));
  if (!runtimeFile) return;
  // eslint-disable-next-line
  require(resolve(`${dirPath}/${runtimeFile}`));
}

async function runCLI() {
  const config = await getConfig();
  registerCoreExtensions();
  await loadLegacyConfig(config);
  const harmony = await Harmony.load([CLIAspect, BitAspect], MainRuntime.name, config.toObject());
  await harmony.run(async (aspect: Extension, runtime: RuntimeDefinition) => requireAspects(aspect, runtime));

  const cli = harmony.get<CLIMain>('teambit.bit/cli');
  cli.run();
}
