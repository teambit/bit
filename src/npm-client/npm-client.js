// @flow
import execa from 'execa';
import R, { isNil, merge, toPairs, map, join, is } from 'ramda';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import logger from '../logger/logger';
import { DEFAULT_PACKAGE_MANAGER } from '../constants';

const objectToArray = obj => map(join('@'), toPairs(obj));
const rejectNils = R.reject(isNil);

const defaultNpmArgs = [];
const defaultYarnArgs = [];
const defaultPackageManagerArgs = {
  npm: defaultNpmArgs,
  yarn: defaultYarnArgs
};
const defaultPackageManagerProcessOptions = {
  cwd: process.cwd
};
const warningPrefix = (packageManager: string): string => {
  return packageManager === 'npm' ? 'npm WARN' : 'warning';
};
const errorPrefix = (packageManager: string): string => {
  return packageManager === 'npm' ? 'npm ERR!' : 'error';
};
const peerDependenciesMissing = (packageManager: string): string => {
  return packageManager === 'npm' ? 'requires a peer' : 'unmet peer';
};

const stripNonNpmErrors = (errors: string, packageManager: string) => {
  // a workaround to remove all 'npm warn' and 'npm notice'.
  // NPM itself returns them even when --loglevel = error or when --silent/--quiet flags are set
  const prefix = errorPrefix(packageManager);
  return errors
    .split('\n')
    .filter(error => error.startsWith(prefix))
    .join('\n');
};

const stripNonPeerDependenciesWarnings = (errors: string, packageManager: string) => {
  const prefix = warningPrefix(packageManager);
  const peer = peerDependenciesMissing(packageManager);
  return errors
    .split('\n')
    .filter(error => error.startsWith(prefix) && error.includes(peer))
    .join('\n');
};

/**
 * Pick only allowed to be overridden options
 * @param {Object} userOptions
 */
const getAllowdPackageManagerProcessOptions = (userOptions) => {
  const allowdOptions = ['shell', 'env', 'extendEnv', 'uid', 'gid', 'preferLocal', 'localDir', 'timeout'];
  return R.pick(allowdOptions, userOptions);
};

type installArgs = {
  modules?: string[] | { [string]: number | string },
  packageManager: 'npm' | 'yarn',
  packageManagerArgs: string[],
  packageManagerProcessOptions: Object,
  useWorkspaces: boolean,
  dirs: string[],
  rootDir: ?string, // Used for yarn workspace
  installRootPackageJson: ?boolean,
  verbose: boolean
};

/**
 * Install packages in specific directory
 */
const _installInOneDirectory = ({
  modules = [],
  packageManager = DEFAULT_PACKAGE_MANAGER,
  packageManagerArgs = [],
  packageManagerProcessOptions = {},
  dir,
  verbose = false
}) => {
  // Handle process options
  const allowedPackageManagerProcessOptions = getAllowdPackageManagerProcessOptions(packageManagerProcessOptions);
  const concretePackageManagerProcessOptions = merge(
    defaultPackageManagerProcessOptions,
    allowedPackageManagerProcessOptions
  );
  concretePackageManagerProcessOptions.cwd = dir || concretePackageManagerProcessOptions.cwd;
  const cwd = concretePackageManagerProcessOptions.cwd;

  // taking care of object case
  const processedModules = is(Object, modules) && !Array.isArray(modules) ? objectToArray(modules) : modules;

  // Handle process args
  const concretePackageManagerDefaultArgs = [
    'install',
    ...processedModules,
    ...defaultPackageManagerArgs[packageManager]
  ];
  const concretePackageManagerArgs = rejectNils(R.concat(concretePackageManagerDefaultArgs, packageManagerArgs));

  // Add npm verbose flag
  if (verbose && packageManager === 'npm') {
    // we may want to use it later. For now, it print too much information
    // concretePackageManagerArgs.push('--verbose');
  }

  fs.ensureDirSync(path.join(cwd, 'node_modules'));
  logger.debug(
    `installing npm packages using ${packageManager} at ${cwd} with options:`,
    concretePackageManagerProcessOptions,
    `and args: ${concretePackageManagerArgs}`
  );

  // Set the shell to true to prevent problems with post install scripts when running as root
  const packageManagerClientName = packageManager;
  const childProcess = execa(
    packageManagerClientName,
    concretePackageManagerArgs,
    concretePackageManagerProcessOptions
  );

  // Remove the install from args since it's always there
  const printArgs = concretePackageManagerArgs.filter(arg => arg !== 'install');
  const argsString = printArgs && printArgs.length > 0 ? `with args: ${printArgs}` : '';

  return childProcess
    .then(({ stdout, stderr }) => {
      const successMessage = `\nsuccessfully ran ${packageManager} install at ${cwd} ${argsString}`;
      const peerWarnings = stripNonPeerDependenciesWarnings(stderr, packageManager);

      stdout = verbose ? stdout + successMessage : chalk.white(peerWarnings) + successMessage;
      stderr = verbose ? stderr : '';
      return { stdout, stderr };
    })
    .catch((err) => {
      let stderr = `failed running ${packageManager} install at ${cwd} ${argsString} \n`;
      stderr += verbose ? err.stderr : stripNonNpmErrors(err.stderr, packageManager);
      return Promise.reject(`${stderr}`);
    });
};

/**
 * when modules is empty, it runs 'npm install' without any package, which installs according to package.json file
 */
const installAction = async ({
  modules,
  packageManager = DEFAULT_PACKAGE_MANAGER,
  packageManagerArgs = [],
  packageManagerProcessOptions = {},
  useWorkspaces = false,
  dirs = [],
  rootDir,
  installRootPackageJson = false,
  verbose = false
}: installArgs) => {
  if (useWorkspaces && packageManager === 'yarn') {
    return _installInOneDirectory({
      modules,
      packageManager,
      packageManagerArgs,
      packageManagerProcessOptions,
      dir: rootDir,
      verbose
    });
  }

  const results = [];
  if (installRootPackageJson) {
    // installation of the root package.json has to be completed before installing the sub-directories package.json.
    const rootDirResults = await _installInOneDirectory({
      modules,
      packageManager,
      packageManagerArgs,
      packageManagerProcessOptions,
      dir: rootDir,
      verbose
    });
    results.push(rootDirResults);
  }

  const promises = dirs.map(dir =>
    _installInOneDirectory({ modules, packageManager, packageManagerArgs, packageManagerProcessOptions, dir, verbose })
  );

  return results.concat(await Promise.all(promises));
};

const printResults = ({ stdout, stderr }: { stdout: string, stderr: string }) => {
  console.log(chalk.yellow(stdout)); // eslint-disable-line
  console.log(chalk.yellow(stderr)); // eslint-disable-line
};

export default {
  install: installAction,
  printResults
};
