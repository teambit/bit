import { Extension } from '@teambit/harmony/dist/extension';
import { resolve } from 'path';
import { readdir } from 'fs-extra';
import { Harmony, RuntimeDefinition } from '@teambit/harmony';
import { handleErrorAndExit } from './cli/command-runner';
import { BitAspect, registerCoreExtensions } from './extensions/bit';
import { CLIAspect, MainRuntime } from './extensions/cli/cli.aspect';
import { bootstrap } from './bootstrap';
import { CLIMain } from './extensions/cli';
import { HarmonyConfig } from './components/modules/harmony-config';
import { getConsumerInfo } from './consumer';
import { propogateUntil as propagateUntil } from './utils';
import { ConfigAspect, ConfigRuntime } from './extensions/config';

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
    return HarmonyConfig.load('workspace.jsonc', configOpts);
  }

  if (scopePath && !consumerInfo) {
    return HarmonyConfig.load('scope.jsonc', configOpts);
  }

  return HarmonyConfig.loadGlobal(configOpts.global);
}

async function requireAspects(aspect: Extension, runtime: RuntimeDefinition) {
  const id = aspect.name;
  const aspectName = id.split('/')[1];
  if (!aspectName) throw new Error('could not retrieve aspect name');
  const dirPath = resolve(`${__dirname}/extensions/${aspectName}`);
  const files = await readdir(dirPath);
  const runtimeFile = files.find((file) => file.includes(`.${runtime.name}.runtime.`));
  if (!runtimeFile) return;
  // eslint-disable-next-line
  require(resolve(`${dirPath}/${runtimeFile}`));
}

async function runCLI() {
  const config = await getConfig();
  registerCoreExtensions();
  loadLegacyConfig(config);
  // const harmony = await Harmony.load([CLIAspect, BitAspect], MainRuntime.name, config);
  const harmony = await Harmony.load([CLIAspect, BitAspect], MainRuntime.name, config.toObject());
  await harmony.run(async (aspect: Extension, runtime: RuntimeDefinition) => requireAspects(aspect, runtime));

  const cli = harmony.get<CLIMain>('teambit.bit/cli');
  cli.run();
}
