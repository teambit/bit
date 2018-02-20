// @flow
import R from 'ramda';
import npmClient from '.';
import loader from '../cli/loader';
import { BEFORE_INSTALL_NPM_DEPENDENCIES } from '../cli/loader/loader-messages';
import { ComponentWithDependencies } from '../scope';
import { Consumer } from '../consumer';

export async function installPackages(
  consumer: Consumer,
  dirs: string[],
  verbose: boolean,
  installRootPackageJson: boolean = false
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
    verbose
  });

  loader.stop();
  if (!Array.isArray(results)) {
    results = [results];
  }
  results.forEach((result) => {
    if (result) npmClient.printResults(result);
  });
}

export async function installNpmPackagesForComponents(
  consumer: Consumer,
  componentsWithDependencies: ComponentWithDependencies[],
  verbose: boolean = false
): Promise<*> {
  // if dependencies are installed as bit-components, go to each one of the dependencies and install npm packages
  // otherwise, if the dependencies are installed as npm packages, npm already takes care of that
  const componentsWithDependenciesFlatten = R.flatten(
    componentsWithDependencies.map((oneComponentWithDependencies) => {
      return oneComponentWithDependencies.component.dependenciesSavedAsComponents
        ? [oneComponentWithDependencies.component, ...oneComponentWithDependencies.dependencies]
        : [oneComponentWithDependencies.component];
    })
  );

  const componentDirs = componentsWithDependenciesFlatten.map(component => component.writtenPath);
  return installPackages(consumer, componentDirs, verbose);
}
