import { buildRegistry, CommandRegistry } from '../cli';

export default async function cliProvider(config: {}) {
  // const cmdRegistry = buildRegistry([]);

  try {
    // cmdRegistry.run();
  } catch (err) {
    console.error('loud rejected:', err); // eslint-disable-line no-console
  }

  // return new BitCli(bit, cmdRegistry);
}
