import { Harmony } from '@teambit/harmony';
import { handleErrorAndExit } from './cli/command-runner';
import { ConfigExt } from './extensions/config';
import { BitExt, registerCoreExtensions } from './extensions/bit';
import { CLIExtension } from './extensions/cli';
import { bootstrap } from './bootstrap';
import { AspectExtension } from './extensions/aspect';

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
  const harmony = Harmony.load([AspectExtension, CLIExtension], {});
  await harmony.run(AspectExtension);
  const aspectExtension = harmony.get<AspectExtension>('@teambit/aspect');
  aspectExtension.applyRuntime('cli');
  // if (!aspectExtension) throw new Error(`failed to get CLIExtension from Harmony`);
  // await aspectExtension.run();
}
