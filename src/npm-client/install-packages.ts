import fs from 'fs-extra';
import * as path from 'path';
import R from 'ramda';

import loader from '../cli/loader';
import { BEFORE_INSTALL_NPM_DEPENDENCIES } from '../cli/loader/loader-messages';
import { DEFAULT_PACKAGE_MANAGER, PACKAGE_JSON } from '../constants';
import Consumer from '../consumer/consumer';
import { ComponentWithDependencies } from '../scope';
import filterAsync from '../utils/array/filter-async';
import { PathAbsolute, PathOsBasedRelative } from '../utils/path';
import npmClient from '.';

export async function installPackages(
  consumer: Consumer,
  dirs: string[],
  verbose: boolean, // true shows all messages, false shows only a successful message
  installRootPackageJson = false,
  silentPackageManagerResult = false, // don't shows packageManager results at all
  installPeerDependencies = false, // also install peer dependencies
  installProdPackagesOnly = false
) {
  const dirsWithPkgJson = await filterDirsWithoutPackageJson(dirs);
  const packageManager = consumer.config.packageManager || DEFAULT_PACKAGE_MANAGER;
  const packageManagerArgs = consumer.packageManagerArgs.length
    ? consumer.packageManagerArgs
    : consumer.config.dependencyResolver?.extraArgs || [];
  const packageManagerProcessOptions = consumer.config.dependencyResolver?.packageManagerProcessOptions || {};
  const useWorkspaces = consumer.config._useWorkspaces;

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
    useWorkspaces: !!useWorkspaces,
    dirs: dirsWithPkgJson,
    rootDir: consumer.getPath(),
    installRootPackageJson,
    installPeerDependencies,
    installProdPackagesOnly,
    verbose,
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
  installPeerDependencies = false,
  installProdPackagesOnly = false,
}: {
  consumer: Consumer;
  basePath: string | null | undefined;
  componentsWithDependencies: ComponentWithDependencies[];
  verbose: boolean;
  silentPackageManagerResult?: boolean;
  installPeerDependencies: boolean;
  installProdPackagesOnly?: boolean;
}): Promise<any> {
  const componentDirsRelative = getAllRootDirectoriesFor(componentsWithDependencies);
  const componentDirs = componentDirsRelative.map((dir) => (basePath ? path.join(basePath, dir) : dir));
  return installPackages(
    consumer,
    componentDirs,
    verbose,
    false,
    silentPackageManagerResult,
    installPeerDependencies,
    installProdPackagesOnly
  );
}

export function getAllRootDirectoriesFor(
  componentsWithDependencies: ComponentWithDependencies[]
): PathOsBasedRelative[] {
  // if dependencies are installed as bit-components, go to each one of the dependencies and install npm packages
  // otherwise, if the dependencies are installed as npm packages, npm already takes care of that
  const componentsWithDependenciesFlatten = R.flatten(
    componentsWithDependencies.map((oneComponentWithDependencies) => {
      return oneComponentWithDependencies.component.dependenciesSavedAsComponents
        ? [oneComponentWithDependencies.component, ...oneComponentWithDependencies.dependencies]
        : [oneComponentWithDependencies.component];
    })
  );

  const componentDirsRelative = componentsWithDependenciesFlatten.map((component) => component.writtenPath);
  return R.uniq(componentDirsRelative);
}

async function filterDirsWithoutPackageJson(dirs: PathAbsolute[]): Promise<PathAbsolute[]> {
  return filterAsync(dirs, (dir) => fs.pathExists(path.join(dir, PACKAGE_JSON)));
}
