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

const stripNonNpmErrors = (errors: string) => {
  // a workaround to remove all 'npm warn' and 'npm notice'.
  // NPM itself returns them even when --loglevel = error or when --silent/--quiet flags are set
  return errors
    .split('\n')
    .filter(error => error.startsWith('npm ERR!') || error.startsWith('error'))
    .join('\n');
};

/**
 * Pick only allowed to be overriden options
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
    concretePackageManagerArgs.push('--verbose');
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

  return childProcess
    .then(({ stdout, stderr }) => {
      stdout = verbose
        ? stdout
        : `successfully ran ${packageManager} install at ${cwd} with args: ${concretePackageManagerArgs}`;
      stderr = verbose ? stderr : '';
      return { stdout, stderr };
    })
    .catch((err) => {
      const stderr = verbose ? err.stderr : stripNonNpmErrors(err.stderr);
      // return Promise.reject(`${stderr}\n\n${err.message}`);
      return Promise.reject(`${stderr}`);
    });
};

/**
 * when modules is empty, it runs 'npm install' without any package, which installs according to package.json file
 */
const installAction = ({
  modules,
  packageManager = DEFAULT_PACKAGE_MANAGER,
  packageManagerArgs = [],
  packageManagerProcessOptions = {},
  useWorkspaces = false,
  dirs = [],
  rootDir,
  verbose = false
}: installArgs) => {
  if (useWorkspaces) {
    return _installInOneDirectory({
      modules,
      packageManager,
      packageManagerArgs,
      packageManagerProcessOptions,
      dir: rootDir,
      verbose
    });
  }
  const promises = dirs.map(dir =>
    _installInOneDirectory({ modules, packageManager, packageManagerArgs, packageManagerProcessOptions, dir, verbose })
  );
  return Promise.all(promises);
};

const printResults = ({ stdout, stderr }: { stdout: string, stderr: string }) => {
  console.log(chalk.yellow(stdout)); // eslint-disable-line
  console.log(chalk.yellow(stderr)); // eslint-disable-line
};

export default {
  install: installAction,
  printResults
};
