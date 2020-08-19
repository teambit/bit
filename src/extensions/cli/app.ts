import { Harmony } from '@teambit/harmony';
import { handleErrorAndExit } from '../../cli/command-runner';
import { ConfigExt, Config } from '../config';
import { BitExt, registerCoreExtensions } from '../bit';
import { CLIMain } from './cli.main.runtime';
import { bootstrap } from '../../bootstrap';
import { AspectExtension } from '../aspect';
import { CLIAspect } from './cli.aspect';
import { RuntimesExtension } from '../runtimes';

initApp();

async function initApp() {
  try {
    await bootstrap();
    registerCoreExtensions();
    const harmony = await Harmony.load([ConfigExt], {});
    await harmony.set([BitExt]);
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
  const harmony = Harmony.load([AspectExtension, CLIMain], {});
  harmony.run(AspectExtension);
  const aspectExtension = harmony.get<RuntimesExtension>('@teambit/aspect');
  aspectExtension.applyRuntime('cli');
  // if (!aspectExtension) throw new Error(`failed to get CLIExtension from Harmony`);
  // await aspectExtension.run();
}
