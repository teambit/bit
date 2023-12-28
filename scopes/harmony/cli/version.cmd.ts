import { Command, CommandOptions } from '@teambit/cli';
import { getHarmonyVersion } from '@teambit/legacy/dist/bootstrap';

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
    const bit = getHarmonyVersion(true);
    return { bit };
  }
}
