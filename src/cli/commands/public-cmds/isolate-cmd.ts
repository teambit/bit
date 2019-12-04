import Command from '../../command';
import { isolate } from '../../../api/consumer';
import { WorkspaceIsolateOptions } from '../../../api/consumer/lib/isolate';

export default class Isolate extends Command {
  name = 'isolate <id> [scopePath]';
  description = 'isolate component';
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [
    ['d', 'directory [directory] ', 'path to store isolated component'],
    ['w', 'write-bit-dependencies [boolean] ', 'write bit components dependencies to package.json file'],
    ['l', 'npm-links [boolean]', 'point dependencies link files to npm package'],
    ['s', 'skip-npm-install [boolean]', 'do not install npm package dependencies'],
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
  remoteOp = true;

  action(
    [id, scopePath]: [string, string | null | undefined],
    opts: {
      directory?: string;
      writeBitDependencies?: boolean;
      npmLinks?: boolean;
      skipNpmInstall?: boolean;
      installPeerDependencies?: boolean;
      dist?: boolean;
      conf?: boolean;
      noPackageJson?: boolean;
      override?: boolean;
      saveDependenciesAsComponents?: boolean;
      excludeRegistryPrefix?: boolean;
      verbose?: boolean;
      silentClientResult?: boolean;
      useCapsule?: boolean;
    }
  ): Promise<any> {
    const concreteOpts: WorkspaceIsolateOptions = {
      writeToPath: opts.directory,
      override: opts.override === true,
      writePackageJson: !opts.noPackageJson,
      writeConfig: opts.conf === true,
      writeBitDependencies: opts.writeBitDependencies === true,
      createNpmLinkFiles: opts.npmLinks === true,
      saveDependenciesAsComponents: opts.saveDependenciesAsComponents !== false,
      writeDists: opts.dist === true,
      installNpmPackages: !opts.skipNpmInstall,
      installPeerDependencies: !opts.skipNpmInstall,
      verbose: opts.verbose === true,
      excludeRegistryPrefix: !!opts.excludeRegistryPrefix,
      silentPackageManagerResult: false,
      useCapsule: opts.useCapsule === true
    };
    return isolate(id, scopePath || process.cwd(), concreteOpts);
  }

  report(directory: string): string {
    return directory;
  }
}
