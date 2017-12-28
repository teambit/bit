/** @flow */
import Command from '../../command';
import { isolate } from '../../../api/consumer';

export default class Isolate extends Command {
  name = 'isolate <id> [scopePath]';
  description = 'isolate component';
  alias = '';
  opts = [
    ['d', 'directory [directory] ', 'path to store isolated component'],
    ['w', 'write-bit-dependencies [boolean] ', 'write bit components dependencies to package.json file'],
    ['l', 'npm-links [boolean]', 'point dependencies link files to npm package'],
    ['i', 'install-packages [boolean]', 'install npm packaged dependencies'],
    ['', 'dist', 'write dist files (when exist) to the configured directory'],
    ['', 'conf', 'write the configuration file (bit.json)'],
    ['', 'no-package-json [boolean]', 'do not generate package.json for the isolated component'],
    ['o', 'override [boolean]', 'override existing isolated component']
  ];
  loader = true;

  action(
    [id, scopePath]: [string, ?string],
    opts: {
      directory: ?string,
      writeBitDependencies: ?boolean,
      npmLinks: ?boolean,
      installPackages: ?boolean,
      dist: ?boolean,
      conf: ?boolean,
      noPackageJson: ?boolean,
      override: ?boolean
    }
  ): Promise<any> {
    opts.writeToPath = opts.directory;
    delete opts.directory;
    return isolate(id, scopePath || process.cwd(), opts);
  }

  report(directory: string): string {
    return directory;
  }
}
