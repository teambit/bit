import type { CommandOptions, Command } from './command';
import { getBitVersion } from '@teambit/bit.get-bit-version';
import { versionCommand } from './cli.commands';

export class VersionCmd implements Command {
  name = versionCommand.name;
  description = versionCommand.description;
  alias = versionCommand.alias;
  loader = versionCommand.loader;
  group = versionCommand.group;
  options = versionCommand.options;

  async report() {
    const results = await this.json();
    return results.bit;
  }

  async json() {
    const bit = getBitVersion();
    return { bit };
  }
}
