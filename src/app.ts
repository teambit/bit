import { Harmony } from '@teambit/harmony';
import { handleErrorAndExit } from './cli/command-runner';
import { ConfigExt } from './extensions/config';
import BitAspect, { BitExt, registerCoreExtensions } from './extensions/bit';
import { CLIAspect } from './extensions/cli/cli.aspect';
import { bootstrap } from './bootstrap';
import { AspectExtension } from './extensions/aspect';
import { RuntimesCLI } from './extensions/runtimes/runtimes.cli';
import RuntimesAspect from './extensions/runtimes/runtimes.aspect';
import { CLIExtension } from './extensions/cli';

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

async function runCLI() {
  // const config = await getConfig();
  const harmony = await Harmony.load([CLIAspect, BitAspect], {});
  await harmony.run('cli');
  const cli = harmony.get<CLIExtension>('@teambit/cli');
  cli.run();
}
