import rightpad from 'pad-right';
import chalk from 'chalk';
import tar from 'tar';
import * as path from 'path';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import childProcess, { StdioOptions } from 'child_process';
import { expect } from 'chai';
import { NOTHING_TO_TAG_MSG } from '../cli/commands/public-cmds/tag-cmd';
import { removeChalkCharacters } from '../utils';
import runInteractive from '../interactive/utils/run-interactive-cmd';
import { InteractiveInputs } from '../interactive/utils/run-interactive-cmd';
import ScopesData from './e2e-scopes';
import { CURRENT_UPSTREAM } from '../constants';
import { ENV_VAR_FEATURE_TOGGLE, LEGACY_SHARED_DIR_FEATURE } from '../api/consumer/lib/feature-toggle';

const DEFAULT_DEFAULT_INTERVAL_BETWEEN_INPUTS = 200;

/**
 * to enable a feature for Helper instance, in the e2e-test file add `helper.command.setFeatures('your-feature');`
 * to enable a feature for a single command, add the feature to the runCmd, e.g. `runCmd(cmd, cwd, stdio, 'your-feature');`
 * if you set both, the runCmd wins.
 * more about feature-toggle head to feature-toggle.ts file.
 */
export default class CommandHelper {
  scopes: ScopesData;
  debugMode: boolean;
  bitBin: string;
  featuresToggle: string | undefined;
  constructor(scopes: ScopesData, debugMode: boolean) {
    this.scopes = scopes;
    this.debugMode = debugMode;
    this.bitBin = process.env.npm_config_bit_bin || 'bit'; // e.g. npm run e2e-test --bit_bin=bit-dev
  }

  setFeatures(featuresToggle: string) {
    this.featuresToggle = featuresToggle;
  }

  runCmd(
    cmd: string,
    cwd: string = this.scopes.localPath,
    stdio: StdioOptions = 'pipe',
    overrideFeatures?: string
  ): string {
    if (this.debugMode) console.log(rightpad(chalk.green('cwd: '), 20, ' '), cwd); // eslint-disable-line no-console
    const isBitCommand = cmd.startsWith('bit ');
    if (isBitCommand) cmd = cmd.replace('bit', this.bitBin);
    const featuresTogglePrefix = isBitCommand ? this._getFeatureToggleCmdPrefix(overrideFeatures) : '';
    cmd = featuresTogglePrefix + cmd;
    if (this.debugMode) console.log(rightpad(chalk.green('command: '), 20, ' '), cmd); // eslint-disable-line no-console
    // const cmdOutput = childProcess.execSync(cmd, { cwd, shell: true });
    const cmdOutput = childProcess.execSync(cmd, { cwd, stdio });
    if (this.debugMode) console.log(rightpad(chalk.green('output: '), 20, ' '), chalk.cyan(cmdOutput.toString())); // eslint-disable-line no-console
    return cmdOutput.toString();
  }

  _getFeatureToggleCmdPrefix(overrideFeatures?: string): string {
    const featuresToggle = overrideFeatures || this.featuresToggle;
    if (!featuresToggle) return '';
    const featureToggleStr = `${ENV_VAR_FEATURE_TOGGLE}=${featuresToggle}`;
    if (process.platform === 'win32') {
      return `set "${featureToggleStr}" && `;
    }
    return `${featureToggleStr} `;
  }

  listRemoteScope(raw = true, options = '') {
    return this.runCmd(`bit list ${this.scopes.remote} ${options} ${raw ? '--raw' : ''}`);
  }
  listLocalScope(options = '') {
    return this.runCmd(`bit list ${options}`);
  }
  listLocalScopeParsed(options = ''): Record<string, any>[] {
    const output = this.runCmd(`bit list --json ${options}`);
    return JSON.parse(output);
  }
  listRemoteScopeParsed(options = '') {
    const output = this.runCmd(`bit list ${this.scopes.remote} --json ${options}`);
    return JSON.parse(output);
  }
  listScopeParsed(scope: string, options = '') {
    const output = this.runCmd(`bit list ${scope} --json ${options}`);
    return JSON.parse(output);
  }

  catScope(includeExtraData = false) {
    const extraData = includeExtraData ? '--json-extra' : '';
    const result = this.runCmd(`bit cat-scope --json ${extraData}`);
    return JSON.parse(result);
  }

  catObject(hash: string, parse = false) {
    const result = this.runCmd(`bit cat-object ${hash}`);
    if (!parse) return result;
    return JSON.parse(result);
  }

  catComponent(id: string, cwd?: string, parse = true): Record<string, any> {
    const result = this.runCmd(`bit cat-component ${id} --json`, cwd);
    return parse ? JSON.parse(result) : result;
  }
  /**
   * add component as legacy-mode.
   * rootDir is not set for authored. same as it was on versions < 14.8.0.
   * useful for tests that involve originallySharedDir logic. that's the only way to test them.
   */
  addComponentLegacy(filePaths: string, options: Record<string, any> = {}, cwd: string = this.scopes.localPath) {
    const value = Object.keys(options)
      .map(key => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit add ${filePaths} ${value} --allow-files`, cwd, undefined, LEGACY_SHARED_DIR_FEATURE);
  }
  addComponentAllowFiles(filePaths: string, options: Record<string, any> = {}, cwd: string = this.scopes.localPath) {
    const value = Object.keys(options)
      .map(key => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit add ${filePaths} ${value} --allow-files`, cwd);
  }
  addComponent(filePaths: string, options: Record<string, any> | string = {}, cwd: string = this.scopes.localPath) {
    const value =
      typeof options === 'string'
        ? options
        : Object.keys(options)
            .map(key => `-${key} ${options[key]}`)
            .join(' ');
    return this.runCmd(`bit add ${filePaths} ${value}`, cwd);
  }
  getConfig(configName: string) {
    return this.runCmd(`bit config get ${configName}`);
  }
  delConfig(configName: string) {
    return this.runCmd(`bit config del ${configName}`);
  }
  setConfig(configName: string, configVal: string) {
    return this.runCmd(`bit config set ${configName} ${configVal}`);
  }
  untrackComponent(id = '', all = false, cwd: string = this.scopes.localPath) {
    return this.runCmd(`bit untrack ${id} ${all ? '--all' : ''}`, cwd);
  }
  removeComponent(id: string, flags = '') {
    return this.runCmd(`bit remove ${id} ${flags}`);
  }
  deprecateComponent(id: string, flags = '') {
    return this.runCmd(`bit deprecate ${id} ${flags}`);
  }
  undeprecateComponent(id: string, flags = '') {
    return this.runCmd(`bit undeprecate ${id} ${flags}`);
  }
  tagComponent(id: string, tagMsg = 'tag-message', options = '') {
    return this.runCmd(`bit tag ${id} -m ${tagMsg} ${options} --allow-relative-paths`);
  }
  tagComponentLegacy(id: string, tagMsg = 'tag-message', options = '') {
    return this.runCmd(
      `bit tag ${id} -m ${tagMsg} ${options} --allow-relative-paths --allow-files`,
      undefined,
      undefined,
      LEGACY_SHARED_DIR_FEATURE
    );
  }
  tagWithoutMessage(id: string, version = '', options = '') {
    return this.runCmd(`bit tag ${id} ${version} ${options} --allow-relative-paths`);
  }
  tagAllComponentsLegacy(options = '', version = '', assertTagged = true) {
    const result = this.runCmd(
      `bit tag -a ${version} ${options} --allow-relative-paths --allow-files`,
      undefined,
      undefined,
      LEGACY_SHARED_DIR_FEATURE
    );
    if (assertTagged) expect(result).to.not.have.string(NOTHING_TO_TAG_MSG);
    return result;
  }
  // @todo: change to tagAllComponentsLegacy
  tagAllComponents(options = '', version = '', assertTagged = true) {
    const result = this.runCmd(`bit tag -a ${version} ${options} --allow-relative-paths --allow-files`);
    if (assertTagged) expect(result).to.not.have.string(NOTHING_TO_TAG_MSG);
    return result;
  }
  // @todo: change to tagAllComponents
  tagAllComponentsNew(options = '', version = '', assertTagged = true) {
    const result = this.runCmd(`bit tag -a ${version} ${options}`);
    if (assertTagged) expect(result).to.not.have.string(NOTHING_TO_TAG_MSG);
    return result;
  }
  rewireAndTagAllComponents(options = '', version = '', assertTagged = true) {
    this.linkAndRewire();
    return this.tagAllComponentsNew(options, version, assertTagged);
  }
  tagScope(version: string, message = 'tag-message', options = '') {
    return this.runCmd(`bit tag -s ${version} -m ${message} ${options} --allow-relative-paths`);
  }
  tagScopeLegacy(version: string, message = 'tag-message', options = '') {
    return this.runCmd(
      `bit tag -s ${version} -m ${message} ${options} --allow-relative-paths --allow-files`,
      undefined,
      undefined,
      LEGACY_SHARED_DIR_FEATURE
    );
  }
  untag(id: string) {
    return this.runCmd(`bit untag ${id}`);
  }
  exportComponent(id: string, scope: string = this.scopes.remote, assert = true) {
    const result = this.runCmd(`bit export ${scope} ${id} --force`);
    if (assert) expect(result).to.not.have.string('nothing to export');
    return result;
  }
  exportAllComponents(scope: string = this.scopes.remote) {
    return this.runCmd(`bit export ${scope} --force`);
  }
  exportAllComponentsAndRewire(scope: string = this.scopes.remote) {
    return this.runCmd(`bit export ${scope} --rewire --force`);
  }
  exportToCurrentScope(ids?: string) {
    return this.runCmd(`bit export ${CURRENT_UPSTREAM} ${ids || ''}`);
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  export(options? = '') {
    // --force just silents the prompt, which obviously needed for CIs
    return this.runCmd(`bit export --force ${options}`);
  }
  ejectComponents(ids: string, flags?: string) {
    return this.runCmd(`bit eject ${ids} ${flags || ''}`);
  }
  ejectComponentsParsed(ids: string, flags?: string) {
    const result = this.runCmd(`bit eject ${ids} ${flags || ''} --json`);
    const jsonStart = result.indexOf('{');
    const jsonResult = result.substring(jsonStart);
    return JSON.parse(jsonResult);
  }
  importComponent(id: string) {
    return this.runCmd(`bit import ${this.scopes.remote}/${id}`);
  }

  importManyComponents(ids: string[]) {
    const idsWithRemote = ids.map(id => `${this.scopes.remote}/${id}`);
    return this.runCmd(`bit import ${idsWithRemote.join(' ')}`);
  }

  importComponentWithOptions(id = 'bar/foo.js', options: Record<string, any>) {
    const value = Object.keys(options)
      .map(key => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit import ${this.scopes.remote}/${id} ${value}`);
  }

  importAllComponents(writeToFileSystem = false) {
    return this.runCmd(`bit import ${writeToFileSystem ? '--merge' : ''}`);
  }

  isolateComponent(id: string, flags: string): string {
    const isolatedEnvOutput = this.runCmd(`bit isolate ${this.scopes.remote}/${id} ${this.scopes.remotePath} ${flags}`);
    const isolatedEnvOutputArray = isolatedEnvOutput.split('\n').filter(str => str);
    return isolatedEnvOutputArray[isolatedEnvOutputArray.length - 1];
  }

  isolateComponentWithCapsule(id: string, capsuleDir: string) {
    return this.runCmd(`bit isolate ${id} --use-capsule --directory ${capsuleDir}`);
  }

  getCapsuleOfComponent(id: string) {
    const capsulesJson = this.runCmd('bit capsule-list -j');
    const capsules = JSON.parse(capsulesJson);
    const capsulePath = capsules.capsules.find(c => c.endsWith(id));
    if (!capsulePath) throw new Error(`unable to find the capsule for ${id}`);
    return capsulePath;
  }

  importExtension(id: string) {
    return this.runCmd(`bit import ${id} --extension`);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  build(id? = '') {
    return this.runCmd(`bit build ${id}`);
  }

  buildComponentWithOptions(id = '', options: Record<string, any>, cwd: string = this.scopes.localPath) {
    const value = Object.keys(options)
      .map(key => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit build ${id} ${value}`, cwd);
  }

  testComponent(id = '') {
    return this.runCmd(`bit test ${id}`);
  }

  testComponentWithOptions(id = '', options: Record<string, any>, cwd: string = this.scopes.localPath) {
    const value = Object.keys(options)
      .map(key => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit test ${id} ${value}`, cwd);
  }

  status() {
    return this.runCmd('bit status');
  }

  statusJson() {
    const status = this.runCmd('bit status --json');
    return JSON.parse(status);
  }

  expectStatusToBeClean() {
    const statusJson = this.statusJson();
    Object.keys(statusJson).forEach(key => {
      expect(statusJson[key], `status.${key} should be empty`).to.have.lengthOf(0);
    });
  }

  statusComponentIsStaged(id: string): boolean {
    const status = this.statusJson();
    return status.stagedComponents.includes(id);
  }

  statusComponentIsModified(id: string): boolean {
    const status = this.statusJson();
    return status.modifiedComponent.includes(id);
  }

  showComponent(id = 'bar/foo') {
    return this.runCmd(`bit show ${id}`);
  }

  showComponentParsed(id = 'bar/foo') {
    const output = this.runCmd(`bit show ${id} --json`);
    return JSON.parse(output);
  }

  showComponentWithOptions(id = 'bar/foo', options: Record<string, any>) {
    const value = Object.keys(options)
      .map(key => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit show ${id} ${value}`);
  }

  checkoutVersion(version: string, ids: string, flags?: string, cwd?: string) {
    return this.runCmd(`bit checkout ${version} ${ids} ${flags || ''}`, cwd);
  }

  checkout(values: string) {
    return this.runCmd(`bit checkout ${values}`);
  }

  mergeVersion(version: string, ids: string, flags?: string) {
    return this.runCmd(`bit merge ${version} ${ids} ${flags || ''}`);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  diff(id? = '') {
    const output = this.runCmd(`bit diff ${id}`);
    return removeChalkCharacters(output);
  }
  log(id: string) {
    return this.runCmd(`bit log ${id}`);
  }
  move(from: string, to: string) {
    return this.runCmd(`bit move ${path.normalize(from)} ${path.normalize(to)}`);
  }
  runTask(taskName: string) {
    return this.runCmd(`bit run ${taskName}`);
  }
  create(name: string) {
    return this.runCmd(`bit create ${name}`);
  }
  moveComponent(id: string, to: string) {
    return this.runCmd(`bit move ${id} ${path.normalize(to)} --component`);
  }
  link() {
    return this.runCmd('bit link');
  }
  linkAndRewire(ids = '') {
    return this.runCmd(`bit link ${ids} --rewire`);
  }

  packComponent(id: string, options: Record<string, any>, extract = false) {
    const value = Object.keys(options)
      .map(key => `-${key} ${options[key]}`)
      .join(' ');
    const result = this.runCmd(`bit pack ${id} ${value}`);
    if (extract) {
      if (
        !options ||
        // We don't just check that it's falsy because usually it's an empty string.
        // eslint-disable-next-line no-prototype-builtins
        (!options.hasOwnProperty('-json') && !options.hasOwnProperty('j')) ||
        (!options['-out-dir'] && !options.d)
      ) {
        throw new Error('extracting supporting only when packing with json and out-dir');
      }
      const resultParsed = JSON.parse(result);
      if (!resultParsed || !resultParsed.tarPath) {
        throw new Error('npm pack results are invalid');
      }
      const tarballFilePath = resultParsed.tarPath;
      const dir = options.d || options['-out-dir'];
      if (this.debugMode) {
        console.log(`untaring the file ${tarballFilePath} into ${dir}`); // eslint-disable-line no-console
      }
      tar.x({ file: tarballFilePath, C: dir, sync: true });
    }
    return result;
  }

  ejectConf(id = 'bar/foo', options?: Record<string, any>) {
    const value = options
      ? Object.keys(options) // $FlowFixMe
          .map(key => `-${key} ${options[key]}`)
          .join(' ')
      : '';
    return this.runCmd(`bit eject-conf ${id} ${value}`);
  }
  injectConf(id = 'bar/foo', options: Record<string, any> | null | undefined) {
    const value = options
      ? Object.keys(options) // $FlowFixMe
          .map(key => `-${key} ${options[key]}`)
          .join(' ')
      : '';
    return this.runCmd(`bit inject-conf ${id} ${value}`);
  }
  doctor(options: Record<string, any>) {
    const parsedOpts = this.parseOptions(options);
    return this.runCmd(`bit doctor ${parsedOpts}`);
  }

  doctorOne(diagnosisName: string, options: Record<string, any>, cwd?: string) {
    const parsedOpts = this.parseOptions(options);
    return this.runCmd(`bit doctor "${diagnosisName}" ${parsedOpts}`, cwd);
  }

  doctorList(options: Record<string, any>) {
    const parsedOpts = this.parseOptions(options);
    return this.runCmd(`bit doctor --list ${parsedOpts}`);
  }

  doctorJsonParsed() {
    const result = this.runCmd('bit doctor --json');
    return JSON.parse(result);
  }

  parseOptions(options: Record<string, any>): string {
    const value = Object.keys(options)
      .map(key => {
        const keyStr = key.length === 1 ? `-${key}` : `--${key}`;
        return `${keyStr} ${options[key]}`;
      })
      .join(' ');
    return value;
  }

  async runInteractiveCmd({
    args = [],
    inputs = [],
    // Options for the process (execa)
    processOpts = {
      cwd: this.scopes.localPath
    },
    // opts for interactive
    opts = {
      defaultIntervalBetweenInputs: DEFAULT_DEFAULT_INTERVAL_BETWEEN_INPUTS,
      verbose: false
    }
  }: {
    args: string[];
    inputs: InteractiveInputs;
    processOpts: Record<string, any>;
    opts: {
      // Default interval between inputs in case there is no specific interval
      defaultIntervalBetweenInputs: number;
      verbose: boolean;
    };
  }) {
    const processName = this.bitBin || 'bit';
    opts.verbose = !!this.debugMode;
    const { stdout } = await runInteractive({ processName, args, inputs, processOpts, opts });
    if (this.debugMode) {
      console.log(rightpad(chalk.green('output: \n'), 20, ' ')); // eslint-disable-line no-console
      console.log(chalk.cyan(stdout)); // eslint-disable-line no-console
    }
    return stdout;
  }
}
