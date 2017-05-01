// @flow
import { exec } from 'child_process';
import R, { mapObjIndexed, isNil, pipe, values, merge, toPairs, map, join, is } from 'ramda';
import decamelize from 'decamelize';
import chalk from 'chalk';

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
  saveDev: false,
  saveOptional: false,
  saveExact: false,
  saveBundle: false,
  force: false,
  dryRun: false,
  ignoreScripts: false,
  legacyBundling: false,
  noOptional: false,
  noShrinkwrap: false,
};

const camelCaseToOptionCase = optName => '--' + decamelize(optName, '-'); // eslint-disable-line

const serializeOption = (bool, optName) => {
  if (optName === 'cwd') return null;
  if (!bool) return null;
  return camelCaseToOptionCase(optName);
};

const installAction = (modules: string[] | string | {[string]: number|string}, userOpts?: Options
) => {
  const options = merge(defaults, userOpts);
  const flags = pipe(
    mapObjIndexed(serializeOption),
    rejectNils,
    values,
  )(options);

  // taking care of object case
  modules = is(Object, modules) && !Array.isArray(modules) ? objectToArray(modules) : modules;
  // taking care of string and no modules cases
  // $FlowFixMe
  modules = Array.isArray(modules) ? modules : (modules && [modules] || []); // eslint-disable-line

  const serializedModules = modules && modules.length > 0 ? ` ${modules.join(' ')}` : '';
  const serializedFlags = flags && flags.length > 0 ? ` ${flags.join(' ')}` : '';

  return new Promise((resolve, reject) =>
    exec(`npm install${serializedModules}${serializedFlags}`,
    { cwd: options.cwd }, (error, stdout, stderr) => {
      if (error) return reject(error);
      return resolve({ stdout, stderr });
    }),
  );
};

const printResults = ({ stdout, stderr }: { stdout: string, stderr: string }) => {
  console.log(chalk.yellow(stdout)); // eslint-disable-line
  console.log(chalk.yellow(stderr)); // eslint-disable-line
};

export default {
  install: installAction,
  printResults,
};
