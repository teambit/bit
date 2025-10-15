import type { CommandOptions, Command } from './command';
import { getBitVersion } from '@teambit/bit.get-bit-version';

export class VersionCmd implements Command {
  name = 'version';
  description = 'display the installed Bit version';
  alias = '';
  loader = false;
  group = 'system';
  options = [['j', 'json', 'return the version in json format']] as CommandOptions;

  async report() {
    const results = await this.json();
    return results.bit;
  }

  async json() {
    const bit = getBitVersion();
    return { bit };
  }
}
