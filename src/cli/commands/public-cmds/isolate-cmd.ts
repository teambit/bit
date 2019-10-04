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
    ['i', 'install-packages [boolean]', 'install npm package dependencies'],
    ['', 'install-peer-dependencies [boolean]', 'install peer npm package dependencies'],
    ['', 'dist', 'write dist files (when exist) to the configured directory'],
    ['', 'conf', 'write the configuration file (bit.json)'],
    ['', 'no-package-json [boolean]', 'do not generate package.json for the isolated component'],
    ['o', 'override [boolean]', 'override existing isolated component'],
    [
      '',
      'save-dependencies-as-components [boolean]',
      'import the dependencies as bit components instead of as npm packages'
    ],
    [
      '',
      'exclude-registry-prefix [boolean]',
      "exclude the registry prefix from the component's name in the package.json"
    ],
    ['v', 'verbose [boolean]', 'print more logs'],
    ['', 'silent-client-result [boolean]', 'print environment install result'],
    ['', 'use-capsule [boolean]', 'use capsule with fs-container']
  ];
  loader = true;

  action(
    [id, scopePath]: [string, string | null | undefined],
    opts: {
      directory: string | null | undefined;
      writeBitDependencies: boolean | null | undefined;
      npmLinks: boolean | null | undefined;
      installPackages: boolean | null | undefined;
      installPeerDependencies: boolean | null | undefined;
      dist: boolean | null | undefined;
      conf: boolean | null | undefined;
      noPackageJson: boolean | null | undefined;
      override: boolean | null | undefined;
      saveDependenciesAsComponents: boolean | null | undefined;
      excludeRegistryPrefix: boolean | null | undefined;
      verbose: boolean | null | undefined;
      silentClientResult: boolean | null | undefined;
      useCapsule: boolean | null | undefined;
    }
  ): Promise<any> {
    opts.writeToPath = opts.directory;
    return isolate(id, scopePath || process.cwd(), opts);
  }

  report(directory: string): string {
    return directory;
  }
}
