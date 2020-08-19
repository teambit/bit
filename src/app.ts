import { Extension } from '@teambit/harmony/dist/extension';
import { resolve, join } from 'path';
import { readdir, readFileSync } from 'fs-extra';
import { Harmony, RuntimeDefinition } from '@teambit/harmony';
import { handleErrorAndExit } from './cli/command-runner';
import { BitAspect } from './extensions/bit';
import { CLIAspect, MainRuntime } from './extensions/cli/cli.aspect';
import { bootstrap } from './bootstrap';
import { CLIMain } from './extensions/cli';
import { HarmonyConfig } from './components/modules/harmony-config';
import { getConsumerInfo } from './consumer';
import { propogateUntil as propagateUntil } from './utils';

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

function loadLegacyConfig() {
  const harmony = Harmony.load();
}

async function getConfig() {
  const cwd = process.cwd();
  const consumerInfo = await getConsumerInfo(cwd);
  const scopePath = propagateUntil(cwd);
  const configOpts = {
    global: {
      name: '.bitrc.jsonc',
    },
  };

  if (consumerInfo) {
    return HarmonyConfig.load('workspace.jsonc', configOpts);
  }

  if (scopePath) {
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
  // const harmony = await Harmony.load([CLIAspect, BitAspect], MainRuntime.name, config);
  const harmony = await Harmony.load([CLIAspect, BitAspect], MainRuntime.name, config.toObject());
  await harmony.run(async (aspect: Extension, runtime: RuntimeDefinition) => requireAspects(aspect, runtime));

  const cli = harmony.get<CLIMain>('teambit.bit/cli');
  cli.run();
}
