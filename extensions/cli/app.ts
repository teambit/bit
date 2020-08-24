/* eslint-disable import/first */
// eslint-disable-next-line no-console
process.on('uncaughtException', (err) => console.log('uncaughtException', err));

require('v8-compile-cache');

import './hook-require';

import { getAspectDir } from '@teambit/aspect-loader';
import { BitAspect, registerCoreExtensions } from '@teambit/bit';
import { ConfigAspect, ConfigRuntime } from '@teambit/config';
import { Harmony, RuntimeDefinition } from '@teambit/harmony';
import { Extension } from '@teambit/harmony/dist/extension';
import { Config } from '@teambit/harmony/dist/harmony-config';
import { bootstrap } from 'bit-bin/dist/bootstrap';
import { handleErrorAndExit } from 'bit-bin/dist/cli/command-runner';
import { getConsumerInfo } from 'bit-bin/dist/consumer';
import { propogateUntil as propagateUntil } from 'bit-bin/dist/utils';
import { readdir } from 'fs-extra';
import { resolve } from 'path';

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
    cwd: consumerInfo?.path || scopePath,
  };

  if (consumerInfo) {
    return Config.load('workspace.jsonc', configOpts);
  }

  if (scopePath && !consumerInfo) {
    return Config.load('scope.jsonc', configOpts);
  }

  return Config.loadGlobal(configOpts.global);
}

export async function requireAspects(aspect: Extension, runtime: RuntimeDefinition) {
  const id = aspect.name;
  if (!id) throw new Error('could not retrieve aspect id');
  const dirPath = getAspectDir(id);
  const files = await readdir(dirPath);
  const runtimeFile = files.find((file) => file.includes(`.${runtime.name}.runtime.js`));
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
  await cli.run();
}
