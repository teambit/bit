import { Extension } from '@teambit/harmony/dist/extension';
import { resolve } from 'path';
import { readdir } from 'fs-extra';
import { Harmony, RuntimeDefinition } from '@teambit/harmony';
import { handleErrorAndExit } from './cli/command-runner';
import { Config, ConfigAspect } from './extensions/config';
import { BitAspect } from './extensions/bit';
import { CLIAspect, MainRuntime } from './extensions/cli/cli.aspect';
import { bootstrap } from './bootstrap';
import { CLIMain } from './extensions/cli';

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

async function getConfig() {
  const harmony = await Harmony.load([ConfigAspect], MainRuntime.name, {});
  await harmony.run(async (aspect: Extension, runtime: RuntimeDefinition) => requireAspects(aspect, runtime));
  // const config = harmony.get<Config>('@teambit/config');
  // return config.getHarmonyConfigObject();
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
  const harmony = await Harmony.load([CLIAspect, BitAspect], MainRuntime.name, {});
  await harmony.run(async (aspect: Extension, runtime: RuntimeDefinition) => requireAspects(aspect, runtime));

  const cli = harmony.get<CLIMain>('@teambit/cli');
  cli.run();
}
