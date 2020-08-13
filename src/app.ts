import harmony from '@teambit/harmony';
import { handleErrorAndExit } from './cli/command-runner';
import { ConfigExt } from './extensions/config';
import { BitExt, registerCoreExtensions } from './extensions/bit';
import { CLIExtension } from './extensions/cli';
import { bootstrap } from './bootstrap';

initApp();

async function initApp() {
  try {
    await bootstrap();
    registerCoreExtensions();
    await harmony.run(ConfigExt);
    await harmony.set([BitExt]);
    await runCLI();
  } catch (err) {
    const originalError = err.originalError || err;
    handleErrorAndExit(originalError, process.argv[2]);
  }
}

async function runCLI() {
  const cli: CLIExtension = harmony.get('CLIExtension');
  if (!cli) throw new Error(`failed to get CLIExtension from Harmony`);
  await cli.run();
}
