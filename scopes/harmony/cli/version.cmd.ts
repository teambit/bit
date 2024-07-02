import type { CommandOptions, Command } from '@teambit/legacy/dist/cli/command';
import { getBitVersion } from '@teambit/bit.get-bit-version';

export class VersionCmd implements Command {
  name = 'version';
  description = 'shows bit version';
  alias = '';
  loader = false;
  group = 'general';
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
