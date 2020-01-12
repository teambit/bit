import { buildRegistry, CommandRegistry } from '../cli';
import BitCli from './cli.api';

/**
 * a provider function for building `BitCli`
 */
export default async function cliProvider(config: {}) {
  return new BitCli(buildRegistry([]));
}
