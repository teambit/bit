// @flow
import childProcessP from 'child-process-promise';
import R, { mapObjIndexed, isNil, pipe, values, merge, toPairs, map, join, is } from 'ramda';
import decamelize from 'decamelize';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import logger from '../logger/logger';

const spawn = childProcessP.spawn;
const objectToArray = obj => map(join('@'), toPairs(obj));
const rejectNils = R.reject(isNil);

type Options = {
  cwd?: string,
  global?: boolean,
  save?: boolean,
  saveDev?: boolean,
  saveOptional?: boolean,
  saveExact?: boolean,
  saveBundle?: boolean,
  force?: boolean,
  dryRun?: boolean,
  ignoreScripts?: boolean,
  legacyBundling?: boolean,
  noOptional?: boolean,
  noShrinkwrap?: boolean
};

const defaults = {
  cwd: process.cwd(),
  global: false,
  save: false,
  verbose: false,
  saveDev: false,
  saveOptional: false,
  saveExact: false,
  saveBundle: false,
  force: false,
  dryRun: false,
  ignoreScripts: false,
  legacyBundling: false,
  noOptional: false,
  noShrinkwrap: false
};

const camelCaseToOptionCase = optName => '--' + decamelize(optName, '-'); // eslint-disable-line

const serializeOption = (bool, optName) => {
  if (optName === 'cwd') return null;
  if (!bool) return null;
  return camelCaseToOptionCase(optName);
};

const stripNonNpmErrors = (errors: string[]) => {
  // a workaround to remove all 'npm warn' and 'npm notice'.
  // NPM itself returns them even when --loglevel = error or when --silent/--quiet flags are set
  return errors
    .join('')
    .split('\n')
    .filter(error => error.startsWith('npm ERR!'))
    .join('\n');
};

/**
 * when modules is empty, it runs 'npm install' without any package, which installs according to package.json file
 */
const installAction = (
  modules: string[] | string | { [string]: number | string },
  userOpts: Options,
  verbose: boolean
) => {
  const options = merge(defaults, userOpts);
  // Add npm verbose flag
  if (verbose) {
    options.verbose = true;
  }
  const flags = pipe(mapObjIndexed(serializeOption), rejectNils, values)(options);

  // taking care of object case
  modules = is(Object, modules) && !Array.isArray(modules) ? objectToArray(modules) : modules;
  // taking care of string and no modules cases
  // $FlowFixMe
  modules = Array.isArray(modules) ? modules : (modules && [modules]) || []; // eslint-disable-line

  const serializedModules = modules && modules.length > 0 ? ` ${modules.join(' ')}` : '';
  const serializedFlags = flags && flags.length > 0 ? `${flags.join(' ')}` : '';

  fs.ensureDirSync(path.join(options.cwd, 'node_modules'));

  const args = ['install', ...serializedModules.trim().split(' '), serializedFlags];

  const promise = spawn('npm', args, { cwd: options.cwd });
  const childProcess = promise.childProcess;
  const stdoutOutput = [];
  const stderrOutput = [];

  childProcess.stdout.on('data', data => stdoutOutput.push(data.toString()));
  childProcess.stderr.on('data', data => stderrOutput.push(data.toString()));

  let stdout;
  return promise
    .then(() => {
      stdout = verbose
        ? stdoutOutput.join('')
        : `successfully ran npm install${serializedModules}${serializedFlags} at ${options.cwd}`;
      const stderr = verbose ? stderrOutput.join('') : '';
      return { stdout, stderr };
    })
    .catch((err) => {
      const stderr = verbose ? stderrOutput.join('') : stripNonNpmErrors(stderrOutput);
      return Promise.reject(`${stderr}\n\n${err.message}`);
    });
};
const printResults = ({ stdout, stderr }: { stdout: string, stderr: string }) => {
  console.log(chalk.yellow(stdout)); // eslint-disable-line
  console.log(chalk.yellow(stderr)); // eslint-disable-line
};

export default {
  install: installAction,
  printResults
};
