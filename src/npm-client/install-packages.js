// @flow
import R from 'ramda';
import path from 'path';
import npmClient from '.';
import loader from '../cli/loader';
import { BEFORE_INSTALL_NPM_DEPENDENCIES } from '../cli/loader/loader-messages';
import type { ComponentWithDependencies } from '../scope';
import type Consumer from '../consumer/consumer';

export async function installPackages(
  consumer: Consumer,
  dirs: string[],
  verbose: boolean, // true shows all messages, false shows only a successful message
  installRootPackageJson: boolean = false,
  silentPackageManagerResult: boolean = false, // don't shows packageManager results at all
  installPeerDependencies: boolean = false // also install peer dependencies
) {
  const packageManager = consumer.bitJson.packageManager;
  const packageManagerArgs = consumer.packageManagerArgs.length
    ? consumer.packageManagerArgs
    : consumer.bitJson.packageManagerArgs;
  const packageManagerProcessOptions = consumer.bitJson.packageManagerProcessOptions;
  const useWorkspaces = consumer.bitJson.useWorkspaces;

  loader.start(BEFORE_INSTALL_NPM_DEPENDENCIES);

  // don't pass the packages to npmClient.install function.
  // otherwise, it'll try to npm install the packages in one line 'npm install packageA packageB' and when
  // there are mix of public and private packages it fails with 404 error.
  // passing an empty array, results in installing packages from the package.json file
  let results = await npmClient.install({
    modules: [],
    packageManager,
    packageManagerArgs,
    packageManagerProcessOptions,
    useWorkspaces,
    dirs,
    rootDir: consumer.getPath(),
    installRootPackageJson,
    installPeerDependencies,
    verbose
  });

  loader.stop();

  if (!Array.isArray(results)) {
    results = [results];
  }
  if (!silentPackageManagerResult || verbose) {
    results.forEach((result) => {
      if (result) npmClient.printResults(result);
    });
  }
}

export async function installNpmPackagesForComponents({
  consumer,
  basePath,
  componentsWithDependencies,
  verbose = false,
  silentPackageManagerResult = false,
  installPeerDependencies = false
}: {
  consumer: Consumer,
  basePath: ?string,
  componentsWithDependencies: ComponentWithDependencies[],
  verbose: boolean,
  silentPackageManagerResult?: boolean,
  installPeerDependencies: boolean
}): Promise<*> {
  // if dependencies are installed as bit-components, go to each one of the dependencies and install npm packages
  // otherwise, if the dependencies are installed as npm packages, npm already takes care of that
  const componentsWithDependenciesFlatten = R.flatten(
    componentsWithDependencies.map((oneComponentWithDependencies) => {
      return oneComponentWithDependencies.component.dependenciesSavedAsComponents
        ? [oneComponentWithDependencies.component, ...oneComponentWithDependencies.dependencies]
        : [oneComponentWithDependencies.component];
    })
  );

  const componentDirsRelative = componentsWithDependenciesFlatten.map(component => component.writtenPath);
  const componentDirsRelativeUniq = R.uniq(componentDirsRelative);
  const componentDirs = componentDirsRelativeUniq.map(dir => (basePath ? path.join(basePath, dir) : dir));
  return installPackages(consumer, componentDirs, verbose, false, silentPackageManagerResult, installPeerDependencies);
}
