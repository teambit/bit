import { resolve } from 'path';
import { readdir } from 'fs-extra';
import { Harmony, AspectGraph, RuntimeDefinition } from '@teambit/harmony';
import { handleErrorAndExit } from './cli/command-runner';
import { ConfigExt } from './extensions/config';
import { BitAspect } from './extensions/bit';
import { CLIAspect, MainRuntime } from './extensions/cli/cli.aspect';
import { bootstrap } from './bootstrap';
import { CLIExtension } from './extensions/cli';
import M from 'minimatch';
import { Extension } from '@teambit/harmony/dist/extension';

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
  const harmony = Harmony.load([ConfigExt], {});
  await harmony.run(ConfigExt);
  return harmony.config;
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
  // const config = await getConfig();
  const harmony = await Harmony.load([CLIAspect, BitAspect], MainRuntime.name, {});
  await harmony.run(async (aspect: Extension, runtime: RuntimeDefinition) => requireAspects(aspect, runtime));

  const cli = harmony.get<CLIExtension>('@teambit/cli');
  cli.run();
}
